import { initialState, SAVE_VERSION } from '../engine/state';
import { pruneImages } from './imageStore';
import type { GameState } from '../engine/types';

const PREFIX = 'ultimo-relato:save:';
export const SLOTS = ['auto', 'a', 'b', 'c'] as const;
export type SlotId = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<SlotId, string> = {
  auto: 'Automático', a: 'Ranura 1', b: 'Ranura 2', c: 'Ranura 3',
};

export interface SaveMeta {
  slot: SlotId;
  charName: string;
  archetypeId: string | null;
  genre: GameState['genre'];
  day: number;
  hp: number;
  maxHp: number;
  location: string;
  savedAt: number;
  actions: number;
}

function key(slot: SlotId) { return `${PREFIX}${slot}`; }

/** Migra guardados antiguos al formato actual; devuelve null si es irrecuperable. */
function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<GameState> & { v?: number };
  const version = s.version ?? s.v ?? 0;
  if (version > SAVE_VERSION) return null;
  if (!s.charName || !s.archetypeId) return null;

  // Rellena cualquier campo que faltase en versiones previas.
  const merged: GameState = {
    ...initialState,
    ...(s as GameState),
    version: SAVE_VERSION,
    modifiers: s.modifiers ?? [],
    basePenalty: s.basePenalty ?? {},
    customItems: s.customItems ?? {},
    counters: s.counters ?? {},
    stats: { ...initialState.stats, ...(s.stats ?? {}) },
    needs: { ...initialState.needs, ...(s.needs ?? {}) },
    base: { ...initialState.base, ...(s.base ?? {}) },
    // Las posiciones ya vienen guardadas: recolocar aquí bloqueaba el hilo
    // principal hasta dos segundos en partidas con muchos nodos.
    map: s.map?.nodes ? s.map : initialState.map,
    injuries: (s.injuries ?? []).map((i) => ({ ...i, age: i.age ?? 0 })),
    diseases: (s.diseases ?? []).map((d) => ({ ...d, ticks: d.ticks ?? 0 })),
    log: s.log ?? [],
    history: s.history ?? [],
    diary: s.diary ?? [],
    photos: s.photos ?? [],
  };
  return merged;
}

export function writeSave(slot: SlotId, state: GameState): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(key(slot), JSON.stringify({ ...state, savedAt: Date.now() }));
    return { ok: true };
  } catch (err) {
    const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
    return {
      ok: false,
      error: quota
        ? 'No queda espacio de almacenamiento en el navegador. Borra alguna partida antigua.'
        : 'El navegador ha bloqueado el guardado (¿ventana privada?).',
    };
  }
}

export function readSave(slot: SlotId): GameState | null {
  try {
    const raw = localStorage.getItem(key(slot));
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function deleteSave(slot: SlotId): void {
  try { localStorage.removeItem(key(slot)); } catch { /* ignorar */ }
}

export function readMeta(slot: SlotId): SaveMeta | null {
  const s = readSave(slot);
  if (!s) return null;
  return {
    slot,
    charName: s.charName,
    archetypeId: s.archetypeId,
    genre: s.genre,
    day: Math.floor(s.minutes / 1440) + 1,
    hp: s.hp,
    maxHp: s.maxHp,
    location: s.location,
    savedAt: s.savedAt ?? 0,
    actions: s.stats.actions,
  };
}

export function allMeta(): SaveMeta[] {
  return SLOTS.map(readMeta).filter((m): m is SaveMeta => m !== null);
}

/** Borra de IndexedDB las imágenes que ya no usa ninguna partida guardada. */
export async function cleanupImages(extra: GameState | null = null): Promise<void> {
  const keep = new Set<string>();
  const collect = (s: GameState | null) => {
    if (!s) return;
    if (s.sceneKey) keep.add(s.sceneKey);
    for (const p of s.photos) keep.add(p.imageKey);
  };
  for (const slot of SLOTS) collect(readSave(slot));
  collect(extra);
  await pruneImages(keep);
}

// ── Exportar / importar como fichero ────────────────────────────────────────

export function exportSave(state: GameState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const day = Math.floor(state.minutes / 1440) + 1;
  a.href = url;
  a.download = `ultimo-relato-${state.charName.replace(/\s+/g, '-').toLowerCase() || 'partida'}-dia${day}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importSave(file: File): Promise<GameState | null> {
  try {
    const text = await file.text();
    return migrate(JSON.parse(text));
  } catch {
    return null;
  }
}
