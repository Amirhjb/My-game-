import type { DiseaseId, StructureId, WeatherId } from '../engine/types';

// ─────────────────────────────────────────────────────────────────────────────
// Enfermedades
// ─────────────────────────────────────────────────────────────────────────────
export interface DiseaseStage {
  label: string;
  /** Daño por hora de juego. */
  hpPerHour: number;
  hungerMod: number;
  thirstMod: number;
  sleepMod: number;
  /** Penalización en niveles de habilidad. */
  skillMod?: number;
  desc: string;
}

export interface DiseaseDef {
  id: DiseaseId;
  label: string;
  icon: string;
  hue: number;
  stages: [DiseaseStage, DiseaseStage, DiseaseStage];
  /** Turnos en un estadio antes de empeorar. */
  progressEvery: number;
  cures: string[];
  /** Un descanso largo cura el estadio leve. */
  restCures: boolean;
}

export const DISEASES: Record<DiseaseId, DiseaseDef> = {
  fever: {
    id: 'fever', label: 'Fiebre', icon: '🤒', hue: 45, progressEvery: 8, restCures: true,
    cures: ['Antibióticos', 'Botiquín completo'],
    stages: [
      { label: 'Leve',     hpPerHour: 0,    hungerMod: 0,  thirstMod: -3, sleepMod: -1, desc: 'Malestar y calor corporal.' },
      { label: 'Moderada', hpPerHour: -1,   hungerMod: -1, thirstMod: -5, sleepMod: -2, desc: 'Temperatura alta y debilidad notable.' },
      { label: 'Grave',    hpPerHour: -2.5, hungerMod: -2, thirstMod: -8, sleepMod: -3, desc: 'Fiebre muy alta. Riesgo de convulsiones.' },
    ],
  },
  food_poison: {
    id: 'food_poison', label: 'Intoxicación', icon: '🤢', hue: 120, progressEvery: 5, restCures: false,
    cures: ['Carbón activado', 'Botiquín completo', 'Suero oral'],
    stages: [
      { label: 'Leve',     hpPerHour: 0,    hungerMod: -3, thirstMod: -4,  sleepMod: 0,  desc: 'Náuseas y malestar estomacal.' },
      { label: 'Moderada', hpPerHour: -1,   hungerMod: -6, thirstMod: -7,  sleepMod: -1, desc: 'Vómitos. Comer y beber apenas ayuda.' },
      { label: 'Grave',    hpPerHour: -2,   hungerMod: -9, thirstMod: -10, sleepMod: -2, desc: 'Deshidratación severa. Urgente.' },
    ],
  },
  respiratory: {
    id: 'respiratory', label: 'Infección respiratoria', icon: '🫁', hue: 240, progressEvery: 10, restCures: false,
    cures: ['Antibióticos', 'Botiquín completo'],
    stages: [
      { label: 'Leve',     hpPerHour: 0,  hungerMod: -1, thirstMod: -2, sleepMod: -2, skillMod: 1, desc: 'Tos y cansancio persistente.' },
      { label: 'Moderada', hpPerHour: -1, hungerMod: -2, thirstMod: -3, sleepMod: -3, skillMod: 2, desc: 'Dificultad para respirar.' },
      { label: 'Grave',    hpPerHour: -2, hungerMod: -3, thirstMod: -5, sleepMod: -4, skillMod: 3, desc: 'Neumonía. Requiere tratamiento urgente.' },
    ],
  },
  radiation: {
    id: 'radiation', label: 'Contaminación', icon: '☢️', hue: 130, progressEvery: 12, restCures: false,
    cures: ['Yoduro de potasio'],
    stages: [
      { label: 'Leve',     hpPerHour: -0.8, hungerMod: -1, thirstMod: -2, sleepMod: 0,  desc: 'Náuseas y pérdida de cabello.' },
      { label: 'Moderada', hpPerHour: -1.6, hungerMod: -2, thirstMod: -3, sleepMod: -1, desc: 'Debilidad severa y vómitos.' },
      { label: 'Grave',    hpPerHour: -3,   hungerMod: -3, thirstMod: -4, sleepMod: -2, desc: 'Fallo orgánico progresivo.' },
    ],
  },
  wound_infection: {
    id: 'wound_infection', label: 'Herida infectada', icon: '🦠', hue: 310, progressEvery: 7, restCures: false,
    cures: ['Antibióticos', 'Botiquín completo', 'Bisturí'],
    stages: [
      { label: 'Leve',     hpPerHour: 0,    hungerMod: -1, thirstMod: -1, sleepMod: -1, desc: 'Herida enrojecida y caliente al tacto.' },
      { label: 'Moderada', hpPerHour: -1,   hungerMod: -2, thirstMod: -2, sleepMod: -2, desc: 'Pus y fiebre local. Empeorando.' },
      { label: 'Grave',    hpPerHour: -2.5, hungerMod: -3, thirstMod: -3, sleepMod: -3, desc: 'Sepsis. Peligro de muerte inmediato.' },
    ],
  },
  exhaustion: {
    id: 'exhaustion', label: 'Agotamiento', icon: '😴', hue: 275, progressEvery: 6, restCures: true,
    cures: [],
    stages: [
      { label: 'Leve',     hpPerHour: 0,  hungerMod: -2, thirstMod: -1, sleepMod: -3, skillMod: 1, desc: 'Torpeza y reflejos lentos.' },
      { label: 'Moderada', hpPerHour: -1, hungerMod: -3, thirstMod: -2, sleepMod: -4, skillMod: 2, desc: 'Confusión y falta de concentración.' },
      { label: 'Grave',    hpPerHour: -2, hungerMod: -4, thirstMod: -3, sleepMod: -5, skillMod: 3, desc: 'Desmayos espontáneos.' },
    ],
  },
};

export const DISEASE_IDS = Object.keys(DISEASES) as DiseaseId[];

// ─────────────────────────────────────────────────────────────────────────────
// Clima
// ─────────────────────────────────────────────────────────────────────────────
export interface WeatherDef {
  id: WeatherId;
  label: string;
  icon: string;
  /** Duración posible en días. */
  days: number[];
  /** Si es peligroso, el juego lo señala y las acciones rápidas cambian. */
  severe: boolean;
  desc: string;
}

export const WEATHER: Record<WeatherId, WeatherDef> = {
  clear:     { id: 'clear',     label: 'Despejado',           icon: '☀️',  days: [1, 2], severe: false, desc: 'Cielo limpio. Buena visibilidad.' },
  overcast:  { id: 'overcast',  label: 'Nublado',             icon: '☁️',  days: [1, 2], severe: false, desc: 'Luz plana y gris. Nada destaca.' },
  rain:      { id: 'rain',      label: 'Lluvia',              icon: '🌧️', days: [1, 2], severe: false, desc: 'Agua constante. Se puede recoger, pero enfría.' },
  fog:       { id: 'fog',       label: 'Niebla',              icon: '🌫️', days: [1],    severe: false, desc: 'Visibilidad mínima. Oculta tanto como esconde.' },
  acid_rain: { id: 'acid_rain', label: 'Lluvia corrosiva',    icon: '☢️',  days: [1, 2], severe: true,  desc: 'Quema la piel y destruye la ropa a la intemperie.' },
  tornado:   { id: 'tornado',   label: 'Tornado',             icon: '🌪️', days: [1],    severe: true,  desc: 'Arrasa todo lo que no esté bajo tierra.' },
  heatstorm: { id: 'heatstorm', label: 'Ola de calor',        icon: '🔥',  days: [1, 2], severe: true,  desc: 'Deshidratación acelerada y golpes de calor.' },
  ashstorm:  { id: 'ashstorm',  label: 'Tormenta de ceniza',  icon: '🌑',  days: [1, 2], severe: true,  desc: 'Ceniza en el aire. Rastreo y puntería penalizados.' },
  electric:  { id: 'electric',  label: 'Tormenta eléctrica',  icon: '⚡',  days: [1],    severe: true,  desc: 'Descargas constantes. La electrónica peligra.' },
  blizzard:  { id: 'blizzard',  label: 'Ventisca',            icon: '🧊',  days: [1, 2], severe: true,  desc: 'Frío extremo. Sin abrigo, es mortal.' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Refugio
// ─────────────────────────────────────────────────────────────────────────────
export interface StructureDef {
  id: StructureId;
  label: string;
  icon: string;
  desc: string;
  req: { skill: string; level: number };
  mats: { name: string; qty: number }[];
  minutes: number;
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  cama: {
    id: 'cama', label: 'Camastro', icon: '🛏️', minutes: 120,
    desc: 'Dormir aquí restaura mucho más sueño y algo de vida.',
    req: { skill: 'Carpintería', level: 2 }, mats: [{ name: 'Madera', qty: 2 }, { name: 'Tela', qty: 1 }],
  },
  almacen: {
    id: 'almacen', label: 'Almacén', icon: '📦', minutes: 180,
    desc: 'Guarda objetos sin cargarlos encima. Sin límite práctico.',
    req: { skill: 'Carpintería', level: 3 }, mats: [{ name: 'Madera', qty: 3 }, { name: 'Herramientas básicas', qty: 1 }],
  },
  huerto: {
    id: 'huerto', label: 'Huerto', icon: '🌱', minutes: 180,
    desc: 'Produce comida cada 2 días de ausencia.',
    req: { skill: 'Cultivo', level: 2 }, mats: [{ name: 'Semillas variadas', qty: 1 }, { name: 'Madera', qty: 1 }],
  },
  pozo: {
    id: 'pozo', label: 'Recogida de agua', icon: '💧', minutes: 150,
    desc: 'Produce agua potable cada día de ausencia.',
    req: { skill: 'Albañilería', level: 2 }, mats: [{ name: 'Chatarra', qty: 2 }, { name: 'Tela', qty: 1 }],
  },
  taller: {
    id: 'taller', label: 'Taller', icon: '🔧', minutes: 240,
    desc: 'Craftear en el refugio cuesta un 40 % menos de tiempo y falla menos.',
    req: { skill: 'Mecánica', level: 3 }, mats: [{ name: 'Herramientas básicas', qty: 1 }, { name: 'Chatarra', qty: 3 }],
  },
  muro: {
    id: 'muro', label: 'Muro', icon: '🧱', minutes: 300,
    desc: 'Impide que saqueen el almacén mientras estás fuera.',
    req: { skill: 'Albañilería', level: 3 }, mats: [{ name: 'Madera', qty: 3 }, { name: 'Chatarra', qty: 2 }],
  },
  generador: {
    id: 'generador', label: 'Generador', icon: '⚡', minutes: 240,
    desc: 'Luz y energía. Reduce el riesgo nocturno y repara electrónica.',
    req: { skill: 'Electricidad', level: 3 }, mats: [{ name: 'Kit de reparación', qty: 1 }, { name: 'Chatarra', qty: 3 }],
  },
};

export const STRUCTURE_IDS = Object.keys(STRUCTURES) as StructureId[];

// ─────────────────────────────────────────────────────────────────────────────
// Estilos de narrador
// ─────────────────────────────────────────────────────────────────────────────
export interface NarratorDef {
  id: string;
  label: string;
  icon: string;
  tagline: string;
  preview: string;
  /** Instrucción de voz que se inyecta en el prompt del sistema. */
  voice: string;
}

export const NARRATORS: Record<string, NarratorDef> = {
  cronista: {
    id: 'cronista', label: 'El Cronista', icon: '🎩', tagline: 'Preciso. Literario. Implacable.',
    preview: 'El polvo se asienta sobre tus botas como ceniza de algo que fue. Caminas. El mundo no te pide permiso para seguir rompiéndose.',
    voice: 'Segunda persona (tú). Voz serena y literaria. Frases cortas en tensión, largas en quietud. Sin exageración: registra con precisión poética.',
  },
  cinico: {
    id: 'cinico', label: 'El Cínico', icon: '🥃', tagline: 'Sarcástico. Fatalista. Honesto.',
    preview: 'Otra decisión brillante. Seguro que esta vez sale bien. El apocalipsis tiene sentido del humor, y tú eres el chiste que mejor funciona.',
    voice: 'Segunda persona (tú) con sarcasmo seco y humor negro. Comenta las acciones con ironía, sin dejar de dar la información. Nunca insultes al jugador directamente.',
  },
  ansioso: {
    id: 'ansioso', label: 'El Ansioso', icon: '😰', tagline: 'Nervioso. Hiperalerta. Contagioso.',
    preview: '¿Ese ruido? ¿Lo escuchaste? No importa. Sigue moviéndote. El problema es que si te quedas quieto también pasa algo. Siempre pasa algo.',
    voice: 'Segunda persona (tú) con nerviosismo extremo. Usa puntos suspensivos, interrumpe pensamientos, detecta peligro en todo. Mantén siempre los hechos claros pese al tono.',
  },
  oraculo: {
    id: 'oraculo', label: 'El Oráculo', icon: '🧿', tagline: 'Críptico. Metafórico. Inquietante.',
    preview: 'La ciudad mastica sus propios huesos. Tú eres un diente que aún no sabe que está flojo. Camina hacia el oeste: el oeste miente menos.',
    voice: 'Segunda persona (tú) con lenguaje metafórico y simbólico. Nunca describas de forma plana, pero deja SIEMPRE clara la información práctica bajo la metáfora.',
  },
  muerte: {
    id: 'muerte', label: 'La Muerte', icon: '💀', tagline: 'Inevitable. Paciente. Ya lo sabe.',
    preview: 'Te queda tiempo. No mucho, pero algo. Lo interesante no es cuándo — eso ya está decidido — sino qué haces con los minutos que aún son tuyos.',
    voice: 'Segunda persona (tú), como quien ya conoce el final. Melancólico e inevitable, nunca cruel. Añade matices como "por ahora", "mientras puedas", "esta vez".',
  },
  tercera: {
    id: 'tercera', label: 'Narrador clásico', icon: '📖', tagline: 'Tercera persona. Directo.',
    preview: 'Avanzó entre los escombros con cautela. El viento traía olor a ceniza y algo más difícil de nombrar. Encontró lo que buscaba; no estaba seguro de que bastara.',
    voice: 'Tercera persona, usando el nombre del personaje. Narración clásica de novela: clara, sin metáforas forzadas, con buen ritmo.',
  },
};

export const NARRATOR_LIST = Object.values(NARRATORS);

export const MOODS = {
  explore: { label: 'Exploración', icon: '🌫️', hue: 240 },
  tense:   { label: 'Tensión',     icon: '⚠️', hue: 78 },
  combat:  { label: 'Combate',     icon: '⚔️', hue: 25 },
  rest:    { label: 'Descanso',    icon: '🔥', hue: 285 },
  danger:  { label: 'Peligro',     icon: '☠️', hue: 15 },
  weather: { label: 'Tormenta',    icon: '⚡', hue: 210 },
} as const;
