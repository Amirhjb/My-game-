import type { BaseState, GameState, LogEntry, Needs } from './types';

export const SAVE_VERSION = 2;

export const INITIAL_NEEDS: Needs = { hunger: 80, thirst: 80, sleep: 80, temp: 36.5 };

export const INITIAL_BASE: BaseState = {
  established: false, name: 'Refugio', location: '', structures: [], storage: [], lastVisited: 0,
};

let seq = 0;
export function uid(prefix = 'e'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export function makeEntry(kind: LogEntry['kind'], text: string, at: number): LogEntry {
  return { id: uid('l'), kind, text, at };
}

export const initialState: GameState = {
  version: SAVE_VERSION,
  screen: 'intro',
  genre: null,
  charName: '',
  archetypeId: null,
  traits: [],
  narrator: 'cronista',
  skillXp: {},
  hp: 100,
  maxHp: 100,
  needs: { ...INITIAL_NEEDS },
  injuries: [],
  diseases: [],
  modifiers: [],
  minutes: 8 * 60,
  weather: { id: 'clear', daysLeft: 1 },
  forecast: [],
  weatherAccum: 0,
  map: { nodes: {}, currentZone: '' },
  base: { ...INITIAL_BASE },
  location: 'Inicio',
  inventory: [],
  knownRecipes: [],
  log: [],
  history: [],
  diary: [],
  photos: [],
  sceneKey: '',
  sceneDescription: '',
  counters: {},
  stats: {
    actions: 0, daysSurvived: 1, zonesDiscovered: 0, itemsCrafted: 0,
    photosTaken: 0, damageTaken: 0, levelsGained: 0,
  },
  deathCause: null,
  savedAt: null,
};

/** Límites para que el guardado y el contexto del modelo no crezcan sin control. */
export const MAX_LOG = 220;
export const MAX_HISTORY = 24;
export const MAX_PHOTOS = 60;
