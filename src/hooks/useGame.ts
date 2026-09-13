import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AiError, chat } from '../ai/client';
import { fetchSceneImage } from '../ai/images';
import { imageUrl } from '../persistence/imageStore';
import {
  buildCaptionPrompt, buildDiaryPrompt, buildImprovisePrompt, buildOpeningMessage,
  buildStylePrompt, buildSystemPrompt,
} from '../ai/prompts';
import { extractJson, neutralTurn, parseImprovise, parseTurn } from '../ai/schema';
import { reducer, type Action } from '../engine/reducer';
import { clockOf, dayOf } from '../engine/rules';
import { initialState, uid } from '../engine/state';
import type { GameState, TurnResult } from '../engine/types';
import {
  cleanupImages, readSave, writeSave, type SlotId,
} from '../persistence/saves';
import { isConfigured, loadSettings, saveSettings, type Settings } from '../persistence/settings';

export type Status = 'idle' | 'thinking' | 'imaging' | 'improvising' | 'error';

export interface GameApi {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  status: Status;
  error: string | null;
  clearError: () => void;
  suggestions: string[];
  sceneUrl: string | null;
  flash: boolean;
  saveNow: (slot?: SlotId) => { ok: boolean; error?: string };
  loadSlot: (slot: SlotId) => boolean;
  loadState: (state: GameState) => void;
  begin: () => void;
  act: (text: string) => void;
  retry: () => void;
  cancel: () => void;
  takePhoto: () => void;
  improvise: (goal: string) => Promise<void>;
  ready: boolean;
}

const NARRATIVE_TIMEOUT = 90_000;

export function useGame(): GameApi {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sceneUrl, setSceneUrl] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const lastActionRef = useRef<string | null>(null);
  // El estado más reciente, para no leer valores obsoletos dentro de las async.
  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const ready = useMemo(() => isConfigured(settings), [settings]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // ── Guardado automático (con retardo, para no escribir en cada tecla) ──────
  useEffect(() => {
    if (state.screen !== 'game' && state.screen !== 'death') return;
    if (!state.charName) return;
    const t = setTimeout(() => {
      const res = writeSave('auto', state);
      if (res.ok) dispatch({ type: 'markSaved', at: Date.now() });
      else setError(res.error ?? null);
    }, 800);
    return () => clearTimeout(t);
  }, [state]);

  // ── Imagen de escena ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    if (!state.sceneKey) { setSceneUrl(null); return; }
    imageUrl(state.sceneKey).then((url) => { if (alive) setSceneUrl(url); });
    return () => { alive = false; };
  }, [state.sceneKey]);

  // ── Limpieza de imágenes huérfanas al arrancar ────────────────────────────
  useEffect(() => { void cleanupImages(); }, []);

  const clearError = useCallback(() => setError(null), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
  }, []);

  /** Descarga la ilustración de la escena sin bloquear la narrativa. */
  const loadScene = useCallback(async (description: string) => {
    if (!settingsRef.current.images || !description) return;
    setStatus((s) => (s === 'idle' ? 'imaging' : s));
    const key = await fetchSceneImage(description, stateRef.current.genre);
    if (key) dispatch({ type: 'setScene', key, description });
    setStatus((s) => (s === 'imaging' ? 'idle' : s));
  }, []);

  /** Reescritura con la voz elegida. Si falla, se conserva el texto original. */
  const applyStyle = useCallback(async (text: string, signal: AbortSignal): Promise<string> => {
    const s = settingsRef.current;
    if (!s.styleRewrite || stateRef.current.narrator === 'cronista' || !text) return text;
    try {
      const out = await chat(
        s,
        [
          { role: 'system', content: buildStylePrompt(stateRef.current) },
          { role: 'user', content: text },
        ],
        { temperature: 0.95, maxTokens: 900, signal, timeoutMs: 45_000 },
      );
      return out || text;
    } catch {
      return text;
    }
  }, []);

  /** Entrada del diario al dormir. Es opcional: un fallo no corta la partida. */
  const maybeDiary = useCallback(async (minutes: number, signal: AbortSignal) => {
    if (minutes < 240) return;
    const s = stateRef.current;
    const recent = s.log
      .filter((e) => e.kind === 'story')
      .slice(-4)
      .map((e) => e.text)
      .join(' ')
      .slice(0, 900);
    try {
      const raw = await chat(
        settingsRef.current,
        [{ role: 'user', content: buildDiaryPrompt(s, recent) }],
        { temperature: 0.95, maxTokens: 320, json: true, signal, timeoutMs: 40_000 },
      );
      const parsed = extractJson(raw) as { text?: string; mood?: string } | null;
      const text = parsed?.text?.trim() || raw.trim();
      if (!text) return;
      dispatch({
        type: 'addDiary',
        entry: {
          id: uid('d'), day: dayOf(s.minutes), time: clockOf(s.minutes), location: s.location,
          text: text.slice(0, 1200), mood: (parsed?.mood ?? 'cansado').slice(0, 24),
          hp: Math.round(s.hp), hunger: Math.round(s.needs.hunger), thirst: Math.round(s.needs.thirst),
          diseases: s.diseases.map((d) => d.id),
        },
      });
      dispatch({ type: 'log', kind: 'system', text: `${s.charName} escribe en su diario antes de dormir.` });
    } catch {
      /* el diario es un extra; si falla, seguimos */
    }
  }, []);

  /** Un turno completo: petición, validación, aplicación y extras. */
  const runTurn = useCallback(
    async (playerText: string | null, isOpening: boolean, override?: GameState) => {
      if (!isConfigured(settingsRef.current)) {
        setError('Antes de jugar tienes que configurar el proveedor de IA en Ajustes.');
        setStatus('error');
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('thinking');
      setError(null);
      lastActionRef.current = playerText;

      const snapshot = override ?? stateRef.current;
      const system = buildSystemPrompt(snapshot);
      const userContent = isOpening ? buildOpeningMessage(snapshot) : playerText!;
      const messages = [
        { role: 'system' as const, content: system },
        ...snapshot.history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userContent },
      ];

      try {
        const raw = await chat(settingsRef.current, messages, {
          temperature: 0.95, maxTokens: 1500, json: true,
          signal: controller.signal, timeoutMs: NARRATIVE_TIMEOUT,
        });

        const known = Object.keys(snapshot.customItems);
        let { result, fallbackNarrative } = parseTurn(raw, snapshot.map.currentZone || 'Inicio', known);

        // Un reintento con instrucción explícita suele arreglar el JSON roto.
        if (!result) {
          const retryRaw = await chat(
            settingsRef.current,
            [...messages, { role: 'assistant' as const, content: raw.slice(0, 600) },
              { role: 'user' as const, content: 'Tu respuesta no era JSON válido. Repítela EXACTAMENTE en el formato JSON indicado, sin texto adicional.' }],
            { temperature: 0.4, maxTokens: 1500, json: true, signal: controller.signal, timeoutMs: 60_000 },
          ).catch(() => '');
          result = parseTurn(retryRaw, snapshot.map.currentZone || 'Inicio', known).result;
        }

        let turn: TurnResult;
        if (result) {
          turn = result;
        } else if (fallbackNarrative) {
          // Al menos conservamos la prosa; el motor no aplica cambios inventados.
          turn = neutralTurn(fallbackNarrative, snapshot.map.currentZone || 'Inicio');
          dispatch({ type: 'log', kind: 'warn', text: 'El modelo no ha devuelto datos de juego en este turno; solo se ha aplicado la narración.' });
        } else {
          throw new AiError('El modelo ha devuelto algo que no se puede interpretar. Reintenta la acción.', 'empty');
        }

        turn = { ...turn, narrative: await applyStyle(turn.narrative, controller.signal) };

        dispatch({ type: 'pushHistory', role: 'user', content: userContent });
        dispatch({ type: 'pushHistory', role: 'assistant', content: turn.narrative.slice(0, 900) });
        dispatch({ type: 'applyTurn', playerText, result: turn });
        setSuggestions(turn.suggestions);
        setStatus('idle');

        void loadScene(turn.sceneDescription);
        void maybeDiary(turn.timeMinutes, controller.signal);
      } catch (err) {
        if (err instanceof AiError && err.kind === 'abort' && controller.signal.aborted) {
          setStatus('idle');
          return;
        }
        setError(err instanceof Error ? err.message : 'Error inesperado al contactar con el modelo.');
        setStatus('error');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [applyStyle, loadScene, maybeDiary],
  );

  const begin = useCallback(() => {
    // Calculamos la partida inicial aquí para poder pasársela al primer turno
    // sin depender de que React haya vuelto a renderizar todavía.
    const started = reducer(stateRef.current, { type: 'startRun' });
    if (started.screen !== 'game') return;
    stateRef.current = started;
    dispatch({ type: 'load', state: started });
    setSuggestions([]);
    void runTurn(null, true, started);
  }, [runTurn]);

  const act = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean || status === 'thinking') return;
    void runTurn(clean.slice(0, 500), false);
  }, [runTurn, status]);

  const retry = useCallback(() => {
    setError(null);
    const last = lastActionRef.current;
    void runTurn(last, last === null && stateRef.current.log.length === 0);
  }, [runTurn]);

  const saveNow = useCallback((slot: SlotId = 'auto') => {
    const res = writeSave(slot, stateRef.current);
    if (res.ok) dispatch({ type: 'markSaved', at: Date.now() });
    return res;
  }, []);

  const loadState = useCallback((next: GameState) => {
    cancel();
    setSuggestions([]);
    setError(null);
    dispatch({ type: 'load', state: next });
  }, [cancel]);

  const loadSlot = useCallback((slot: SlotId) => {
    const loaded = readSave(slot);
    if (!loaded) return false;
    loadState(loaded);
    return true;
  }, [loadState]);

  /** Foto instantánea de la escena actual, con pie escrito por el narrador. */
  const takePhoto = useCallback(async () => {
    const s = stateRef.current;
    if (!s.sceneKey) {
      dispatch({ type: 'log', kind: 'system', text: 'Todavía no hay ninguna imagen de esta escena que puedas guardar.' });
      return;
    }
    if (s.photos.some((p) => p.imageKey === s.sceneKey)) {
      dispatch({ type: 'log', kind: 'system', text: 'Esta escena ya está en tu álbum.' });
      return;
    }
    setFlash(true);
    setTimeout(() => setFlash(false), 450);

    let caption = `${s.location}, día ${dayOf(s.minutes)}.`;
    try {
      const out = await chat(
        settingsRef.current,
        [{ role: 'user', content: buildCaptionPrompt(s, s.sceneDescription) }],
        { temperature: 1, maxTokens: 80, timeoutMs: 25_000 },
      );
      if (out) caption = out.replace(/^["'«]|["'»]$/g, '').slice(0, 160);
    } catch {
      /* sin pie generado: usamos el de por defecto */
    }
    dispatch({
      type: 'addPhoto',
      photo: {
        id: uid('p'), imageKey: s.sceneKey, caption, location: s.location,
        day: dayOf(s.minutes), time: clockOf(s.minutes),
      },
    });
    dispatch({ type: 'log', kind: 'good', text: `Foto guardada en el álbum: «${caption}»` });
  }, []);

  /**
   * Fabricación sin receta: el modelo juzga si la idea se sostiene y con qué;
   * el motor tira el dado, consume los materiales y aplica el resultado.
   */
  const improvise = useCallback(async (goal: string) => {
    const clean = goal.trim();
    if (!clean) return;
    if (!isConfigured(settingsRef.current)) {
      setError('Configura el proveedor de IA en Ajustes para poder improvisar.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('improvising');
    setError(null);

    const snapshot = stateRef.current;
    try {
      const raw = await chat(
        settingsRef.current,
        [{ role: 'user', content: buildImprovisePrompt(snapshot, clean.slice(0, 200)) }],
        { temperature: 0.6, maxTokens: 700, json: true, signal: controller.signal, timeoutMs: 60_000 },
      );
      const plan = parseImprovise(raw, Object.keys(snapshot.customItems));
      if (!plan) {
        throw new AiError('No se ha podido interpretar la respuesta. Prueba a describirlo de otra forma.', 'empty');
      }
      dispatch({ type: 'improvise', goal: clean.slice(0, 200), plan });
      setStatus('idle');
    } catch (err) {
      if (err instanceof AiError && err.kind === 'abort' && controller.signal.aborted) {
        setStatus('idle');
        return;
      }
      setError(err instanceof Error ? err.message : 'Error al improvisar.');
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  // ── Atajos de teclado globales ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (status === 'thinking' || status === 'improvising')) cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel, status]);

  return {
    state, dispatch, settings, updateSettings, status, error, clearError,
    suggestions, sceneUrl, flash, saveNow, loadSlot, loadState, begin, act, retry, cancel,
    takePhoto: () => { void takePhoto(); },
    improvise,
    ready,
  };
}
