import type { InjuryZone } from '../engine/types';

export interface SkillCategory {
  id: string;
  label: string;
  icon: string;
  skills: string[];
}

export const SKILL_TREE: SkillCategory[] = [
  { id: 'ranged',   label: 'Combate a distancia', icon: '🎯', skills: ['Puntería', 'Recarga'] },
  { id: 'melee',    label: 'Cuerpo a cuerpo',     icon: '🗡️', skills: ['Hacha', 'Hoja larga', 'Contundente', 'Hoja corta', 'Lanza'] },
  { id: 'craft',    label: 'Oficios',             icon: '⚙️', skills: ['Carpintería', 'Cocina', 'Electricidad', 'Herrería', 'Albañilería', 'Mecánica', 'Sastrería'] },
  { id: 'farm',     label: 'Subsistencia',        icon: '🌱', skills: ['Cultivo', 'Cría de animales', 'Fuerza'] },
  { id: 'survival', label: 'Supervivencia',       icon: '🧭', skills: ['Primeros auxilios', 'Pesca', 'Rastreo', 'Sigilo', 'Trampas'] },
];

export const ALL_SKILLS: string[] = SKILL_TREE.flatMap((c) => c.skills);

/** XP acumulada necesaria para alcanzar cada nivel (índice = nivel). */
export const XP_TABLE = [0, 0, 150, 400, 700, 1050, 1450, 1900, 2400, 2950, 3550];
export const MAX_LEVEL = 10;

export function xpToLevel(xp: number): number {
  for (let i = MAX_LEVEL; i >= 1; i--) if (xp >= XP_TABLE[i]) return i;
  return 1;
}

/** Progreso (0..1) dentro del nivel actual. Nivel máximo siempre devuelve 1. */
export function levelProgress(xp: number): number {
  const lvl = xpToLevel(xp);
  if (lvl >= MAX_LEVEL) return 1;
  const floor = XP_TABLE[lvl];
  const ceil = XP_TABLE[lvl + 1];
  return Math.min(1, Math.max(0, (xp - floor) / (ceil - floor)));
}

export function makeSkillXp(levels: Record<string, number> = {}): Record<string, number> {
  return Object.fromEntries(
    ALL_SKILLS.map((s) => [s, XP_TABLE[Math.min(MAX_LEVEL, Math.max(1, levels[s] ?? 1))]]),
  );
}

export const INJURY_ZONES: Record<InjuryZone, { label: string; short: string; skills: string[] }> = {
  cabeza:     { label: 'Cabeza',         short: 'Cab', skills: ['Puntería', 'Rastreo'] },
  torso:      { label: 'Torso',          short: 'Tor', skills: ['Fuerza', 'Cocina', 'Albañilería', 'Herrería', 'Carpintería', 'Mecánica', 'Electricidad', 'Sastrería'] },
  brazo_izq:  { label: 'Brazo izquierdo', short: 'B.i', skills: ['Puntería', 'Recarga', 'Hacha', 'Hoja larga', 'Contundente', 'Hoja corta', 'Lanza'] },
  brazo_der:  { label: 'Brazo derecho',   short: 'B.d', skills: ['Puntería', 'Recarga', 'Hacha', 'Hoja larga', 'Contundente', 'Hoja corta', 'Lanza'] },
  pierna_izq: { label: 'Pierna izquierda', short: 'P.i', skills: ['Sigilo', 'Rastreo', 'Trampas', 'Pesca'] },
  pierna_der: { label: 'Pierna derecha',   short: 'P.d', skills: ['Sigilo', 'Rastreo', 'Trampas', 'Pesca'] },
};

export const INJURY_ZONE_IDS = Object.keys(INJURY_ZONES) as InjuryZone[];

export const SEVERITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Leve', 2: 'Moderada', 3: 'Grave' };
export const SEVERITY_VAR: Record<1 | 2 | 3, string> = { 1: 'var(--warn)', 2: 'oklch(72% 0.17 50)', 3: 'var(--bad)' };
