// ============================================================
// Tipos centrales del juego. Todo el estado vive aquí.
// ============================================================

export type GenreId = 'apocalypse' | 'fantasy' | 'scifi' | 'horror' | 'mystery';

export type ZoneType = 'urban' | 'wilderness' | 'indoor' | 'underground' | 'water' | 'unknown';

export type InjuryZone =
  | 'cabeza' | 'torso' | 'brazo_izq' | 'brazo_der' | 'pierna_izq' | 'pierna_der';

export type DiseaseId =
  | 'fever' | 'food_poison' | 'respiratory' | 'radiation' | 'wound_infection' | 'exhaustion';

export type WeatherId =
  | 'clear' | 'overcast' | 'rain' | 'fog'
  | 'acid_rain' | 'tornado' | 'heatstorm' | 'ashstorm' | 'electric' | 'blizzard';

export type RecipeCategory = 'medico' | 'arma' | 'herramienta' | 'comida' | 'base' | 'explosivo';

export type StructureId = 'cama' | 'almacen' | 'huerto' | 'taller' | 'muro' | 'generador' | 'pozo';

export type Mood = 'explore' | 'tense' | 'combat' | 'rest' | 'danger' | 'weather';

export type Screen =
  | 'intro' | 'genre' | 'archetype' | 'traits' | 'narrator' | 'game' | 'death';

/** Objeto en una bolsa o almacén. */
export interface Stack {
  name: string;
  qty: number;
}

export interface ItemDef {
  kg: number;
  l: number;
  tags: string[];
  /** Contenedores amplían la capacidad de carga. */
  isContainer?: boolean;
  extraKg?: number;
  extraL?: number;
  /** Consumible: efecto directo al usarlo desde el inventario. */
  use?: {
    hunger?: number;
    thirst?: number;
    sleep?: number;
    hp?: number;
    temp?: number;
    /** Cura estas enfermedades al consumirlo. */
    cures?: DiseaseId[];
    /** Reduce la gravedad de las lesiones en este valor. */
    healInjury?: number;
    /** Minutos que consume usarlo. */
    minutes?: number;
    /** Se gasta al usarse (por defecto true). */
    consumed?: boolean;
    verb?: string;
  };
}

export interface Injury {
  zone: InjuryZone;
  severity: 1 | 2 | 3;
  label: string;
  /** Turnos desde que se produjo — se usa para la curación natural. */
  age: number;
}

export interface ActiveDisease {
  id: DiseaseId;
  stage: 0 | 1 | 2;
  /** Turnos acumulados en el estadio actual. */
  ticks: number;
}

export interface Needs {
  hunger: number;
  thirst: number;
  sleep: number;
  /** Temperatura corporal en °C. */
  temp: number;
}

export interface ZoneNode {
  type: ZoneType;
  danger: number;
  visited: boolean;
  x: number;
  y: number;
  connections: string[];
  isBase?: boolean;
  /** Primer día de juego en el que se descubrió. */
  discoveredDay?: number;
}

export interface MapState {
  nodes: Record<string, ZoneNode>;
  currentZone: string;
}

export interface WeatherState {
  id: WeatherId;
  daysLeft: number;
}

export interface BaseState {
  established: boolean;
  name: string;
  location: string;
  structures: StructureId[];
  storage: Stack[];
  lastVisited: number;
}

/** Modificador temporal de habilidad (tormenta de ceniza, abstinencia…). */
export interface Modifier {
  id: string;
  label: string;
  /** Penalización en niveles por habilidad. Clave `*` afecta a todas. */
  skills: Record<string, number>;
  /** Turnos restantes. */
  turns: number;
  kind: 'debuff' | 'buff';
}

export interface LogEntry {
  id: string;
  kind: 'player' | 'story' | 'system' | 'warn' | 'good' | 'bad';
  text: string;
  /** Minuto de juego en el que se registró. */
  at: number;
}

export interface DiaryEntry {
  id: string;
  day: number;
  time: string;
  location: string;
  text: string;
  mood: string;
  hp: number;
  hunger: number;
  thirst: number;
  diseases: string[];
}

export interface Photo {
  id: string;
  /** Clave en IndexedDB; la imagen NO se guarda en el estado. */
  imageKey: string;
  caption: string;
  location: string;
  day: number;
  time: string;
}

export interface RunStats {
  actions: number;
  daysSurvived: number;
  zonesDiscovered: number;
  itemsCrafted: number;
  photosTaken: number;
  damageTaken: number;
  levelsGained: number;
}

export interface GameState {
  version: number;
  screen: Screen;

  // Identidad
  genre: GenreId | null;
  charName: string;
  archetypeId: string | null;
  traits: string[];
  narrator: string;

  // Estadísticas
  skillXp: Record<string, number>;
  hp: number;
  maxHp: number;
  needs: Needs;
  injuries: Injury[];
  diseases: ActiveDisease[];
  modifiers: Modifier[];

  // Mundo
  minutes: number;
  weather: WeatherState;
  forecast: WeatherId[];
  /** Minutos acumulados sin consumir hacia el siguiente cambio de clima. */
  weatherAccum: number;
  map: MapState;
  base: BaseState;
  location: string;

  // Inventario y conocimiento
  inventory: Stack[];
  knownRecipes: string[];

  // Narrativa
  log: LogEntry[];
  /** Historial enviado al modelo (rol/contenido). */
  history: { role: 'user' | 'assistant'; content: string }[];
  diary: DiaryEntry[];
  photos: Photo[];
  sceneKey: string;
  sceneDescription: string;

  // Contadores de rasgos
  counters: Record<string, number>;

  stats: RunStats;
  deathCause: string | null;
  savedAt: number | null;
}

/** Lo que el modelo debe devolver en cada turno, ya validado y saneado. */
export interface TurnResult {
  narrative: string;
  hpChange: number;
  itemsGained: Stack[];
  itemsLost: Stack[];
  skillXp: Record<string, number>;
  timeMinutes: number;
  hungerChange: number;
  thirstChange: number;
  sleepChange: number;
  tempChange: number;
  sceneDescription: string;
  location: string;
  injuriesUpdate: { zone: InjuryZone; severity: 1 | 2 | 3; label: string; action: 'add' | 'remove' }[];
  diseasesUpdate: { id: DiseaseId; action: 'add' | 'remove'; cause?: string }[];
  mapUpdate: { currentZone: string; type: ZoneType; danger: number; connections: string[] } | null;
  /** Sugerencias de acción contextual redactadas por el narrador. */
  suggestions: string[];
}
