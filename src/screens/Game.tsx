import { useEffect, useState } from 'react';
import { archetypeName } from '../data/archetypes';
import { MOODS, WEATHER } from '../data/conditions';
import { ambient } from '../audio/engine';
import { clockOf, dayOf } from '../engine/rules';
import { inferMood } from '../engine/world';
import { ContextRail } from '../components/ContextRail';
import { StatusRail } from '../components/StatusRail';
import { Story } from '../components/Story';
import { Modal, useMediaQuery } from '../components/ui';
import { BaseModal } from '../modals/BaseModal';
import { CraftBook } from '../modals/CraftBook';
import { Album, Diary } from '../modals/Journal';
import { Inventory } from '../modals/Inventory';
import { MapModal } from '../modals/MapModal';
import { SavesModal } from '../modals/SavesModal';
import type { GameApi } from '../hooks/useGame';

type PanelId =
  | 'inventory' | 'craft' | 'map' | 'base' | 'diary' | 'album'
  | 'saves' | 'status' | 'context' | 'sleep' | null;

/** Dormir de verdad: horas a elegir y el motor resuelve la noche entera. */
function SleepModal({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const { state, dispatch } = api;
  const [horas, setHoras] = useState(8);
  const enRefugio = state.base.established && state.map.currentZone === state.base.location;
  const camastro = enRefugio && state.base.structures.includes('cama');
  const muro = enRefugio && state.base.structures.includes('muro');
  const peligro = state.map.nodes[state.map.currentZone]?.danger ?? 2;

  return (
    <Modal title="Dormir" icon="😴" onClose={onClose}>
      <p style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.7, marginBottom: 18 }}>
        Dormir recupera sueño de verdad y deja pasar el tiempo: las enfermedades avanzan,
        las heridas cierran y el clima cambia. Dónde duermas importa.
      </p>

      <label className="u-eyebrow" htmlFor="horas" style={{ display: 'block', marginBottom: 8 }}>
        Cuántas horas — {horas}
      </label>
      <input
        id="horas" type="range" min={1} max={12} step={1} value={horas}
        onChange={(e) => setHoras(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: 18 }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        <span className={`chip ${camastro ? 'chip--pos' : ''}`}>
          {camastro ? '🛏️ Camastro: descanso completo' : 'Sin camastro: duermes peor'}
        </span>
        <span className={`chip ${muro ? 'chip--pos' : peligro >= 3 ? 'chip--neg' : ''}`}>
          {muro ? '🧱 El muro te protege' : `Riesgo de la zona: ${peligro}/5`}
        </span>
      </div>

      <button
        className="btn btn--primary btn--block btn--lg"
        onClick={() => { dispatch({ type: 'sleep', hours: horas }); onClose(); }}
      >
        Dormir {horas} {horas === 1 ? 'hora' : 'horas'}
      </button>
    </Modal>
  );
}

export function Game({ api, onSettings }: { api: GameApi; onSettings: () => void }) {
  const { state, settings, status } = api;
  const [panel, setPanel] = useState<PanelId>(null);
  const compact = useMediaQuery('(max-width: 860px)');
  const mood = inferMood(state);

  // El ambiente sonoro sigue la tensión de la escena.
  useEffect(() => {
    if (!settings.music) { if (ambient.enabled) ambient.disable(); return; }
    if (!ambient.enabled) void ambient.enable(mood);
    else ambient.play(mood);
  }, [settings.music, mood]);

  useEffect(() => { ambient.setVolume(settings.volume); }, [settings.volume]);
  useEffect(() => () => ambient.disable(), []);

  // Atajos de teclado para los paneles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
      const map: Record<string, PanelId> = { i: 'inventory', c: 'craft', m: 'map', b: 'base', d: 'diary', f: 'album', z: 'sleep' };
      const next = map[e.key.toLowerCase()];
      if (next) { e.preventDefault(); setPanel((p) => (p === next ? null : next)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = () => setPanel(null);
  const weather = WEATHER[state.weather.id];
  const hpPct = (state.hp / state.maxHp) * 100;

  const tools: { id: PanelId; icon: string; label: string; key: string }[] = [
    { id: 'inventory', icon: '🎒', label: 'Mochila', key: 'I' },
    { id: 'craft', icon: '🔨', label: 'Fabricar', key: 'C' },
    { id: 'map', icon: '🗺️', label: 'Mapa', key: 'M' },
    { id: 'base', icon: '🏚️', label: 'Refugio', key: 'B' },
    { id: 'sleep', icon: '😴', label: 'Dormir', key: 'Z' },
    { id: 'diary', icon: '📓', label: 'Diario', key: 'D' },
    { id: 'album', icon: '📷', label: 'Álbum', key: 'F' },
  ];

  return (
    <div className="game">
      <header className="topbar">
        <h1 className="topbar__brand">Último <b>Relato</b></h1>

        <div className="topbar__meta">
          {compact && (
            <span
              className="chip"
              style={{ color: hpPct <= 25 ? 'var(--bad)' : hpPct <= 50 ? 'var(--warn)' : undefined }}
              title={`${Math.round(state.hp)} de ${state.maxHp} de vida`}
            >
              ❤ {Math.round(state.hp)}
            </span>
          )}
          {!compact && (
            <span className="chip" title={`${state.charName} · ${archetypeName(state.archetypeId, state.genre)}`}>
              {state.charName}
            </span>
          )}
          <span className="chip u-num">D{dayOf(state.minutes)} · {clockOf(state.minutes)}</span>
          <span className="chip" title={`${weather.label}. ${weather.desc}`}>
            {weather.icon}{!compact && ` ${weather.label}`}
          </span>
          {settings.music && <span className="chip" title="Ambiente sonoro">{MOODS[mood].icon}</span>}
          {status === 'imaging' && !compact && <span className="chip">Generando imagen…</span>}
        </div>

        <div className="topbar__tools">
          {!compact && tools.map((t) => (
            <button
              key={t.id}
              className="btn btn--icon btn--ghost"
              title={`${t.label} · atajo ${t.key}`}
              aria-label={t.label}
              onClick={() => setPanel(t.id)}
            >
              {t.icon}
            </button>
          ))}
          <button className="btn btn--icon btn--ghost" title="Partidas" aria-label="Partidas" onClick={() => setPanel('saves')}>💾</button>
          <button className="btn btn--icon btn--ghost" title="Ajustes" aria-label="Ajustes" onClick={onSettings}>⚙</button>
        </div>
      </header>

      <aside className="rail rail--left"><StatusRail state={state} /></aside>

      <Story api={api} />

      <aside className="rail rail--right">
        <ContextRail api={api} onOpen={(id) => setPanel(id as PanelId)} />
      </aside>

      <nav className="tabbar" aria-label="Paneles del juego">
        <button onClick={() => setPanel('status')}><span aria-hidden>❤</span>Estado</button>
        <button onClick={() => setPanel('inventory')}><span aria-hidden>🎒</span>Mochila</button>
        <button onClick={() => setPanel('map')}><span aria-hidden>🗺️</span>Mapa</button>
        <button onClick={() => setPanel('sleep')}><span aria-hidden>😴</span>Dormir</button>
        <button onClick={() => setPanel('context')} data-badge={state.photos.length > 0 || state.diary.length > 0}>
          <span aria-hidden>☰</span>Más
        </button>
      </nav>

      {panel === 'inventory' && <Inventory api={api} onClose={close} />}
      {panel === 'craft' && <CraftBook api={api} onClose={close} />}
      {panel === 'map' && (
        <MapModal
          state={state}
          onClose={close}
          onTravel={(zona) => { close(); api.act(`Viajo hasta ${zona}.`); }}
        />
      )}
      {panel === 'sleep' && <SleepModal api={api} onClose={close} />}
      {panel === 'base' && <BaseModal api={api} onClose={close} />}
      {panel === 'diary' && <Diary state={state} onClose={close} />}
      {panel === 'album' && <Album state={state} onClose={close} />}
      {panel === 'saves' && <SavesModal api={api} onClose={close} />}

      {panel === 'status' && (
        <Modal title="Estado" icon="❤" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <StatusRail state={state} />
          </div>
        </Modal>
      )}

      {panel === 'context' && (
        <Modal title="Entorno y más" icon="☰" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <ContextRail api={api} onOpen={(id) => setPanel(id as PanelId)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn" onClick={() => setPanel('craft')}>🔨 Fabricar</button>
              <button className="btn" onClick={() => setPanel('diary')}>📓 Diario ({state.diary.length})</button>
              <button className="btn" onClick={() => setPanel('album')}>📷 Álbum ({state.photos.length})</button>
              <button className="btn" onClick={() => setPanel('saves')}>💾 Partidas</button>
              <button className="btn" onClick={() => { close(); onSettings(); }}>⚙ Ajustes</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
