import { getItem } from '../data/items';
import { DISEASES } from '../data/conditions';
import { INJURY_ZONES, ALL_SKILLS, xpToLevel } from '../data/skills';
import { TRAIT_BY_ID } from '../data/traits';
import type {
  ActiveDisease, GameState, Injury, Modifier, Needs, Stack,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades numéricas y de tiempo
// ─────────────────────────────────────────────────────────────────────────────
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round1 = (v: number) => Math.round(v * 10) / 10;

export const DAY_MINUTES = 1440;

export function dayOf(minutes: number): number {
  return Math.floor(minutes / DAY_MINUTES) + 1;
}

export function clockOf(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function partOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  if (h >= 5 && h < 8) return 'Amanecer';
  if (h >= 8 && h < 12) return 'Mañana';
  if (h >= 12 && h < 14) return 'Mediodía';
  if (h >= 14 && h < 18) return 'Tarde';
  if (h >= 18 && h < 21) return 'Atardecer';
  if (h >= 21 || h < 1) return 'Noche';
  return 'Madrugada';
}

export function isNight(minutes: number): boolean {
  const h = Math.floor(minutes / 60) % 24;
  return h >= 21 || h < 6;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventario (funciones puras — nunca mutan la entrada)
// ─────────────────────────────────────────────────────────────────────────────
export function addItems(list: Stack[], items: Stack[]): Stack[] {
  const out = list.map((s) => ({ ...s }));
  for (const { name, qty } of items) {
    if (!name || qty <= 0) continue;
    const found = out.find((s) => s.name === name);
    if (found) found.qty += qty;
    else out.push({ name, qty });
  }
  return out;
}

export function removeItems(list: Stack[], items: Stack[]): Stack[] {
  let out = list.map((s) => ({ ...s }));
  for (const { name, qty } of items) {
    const idx = out.findIndex((s) => s.name === name);
    if (idx < 0) continue;
    out[idx].qty -= qty;
    if (out[idx].qty <= 0) out = out.filter((_, i) => i !== idx);
  }
  return out;
}

export function countOf(list: Stack[], name: string): number {
  return list.find((s) => s.name === name)?.qty ?? 0;
}

export function hasItem(list: Stack[], name: string, qty = 1): boolean {
  return countOf(list, name) >= qty;
}

export function hasTagged(list: Stack[], tag: string): boolean {
  return list.some((s) => getItem(s.name).tags.includes(tag));
}

// ─────────────────────────────────────────────────────────────────────────────
// Capacidad de carga
// ─────────────────────────────────────────────────────────────────────────────
export interface Capacity { maxKg: number; maxL: number; usedKg: number; usedL: number; over: boolean }

export function capacityOf(inventory: Stack[], forceLevel: number, hasWarehouse: boolean): Capacity {
  let maxKg = 8 + forceLevel * 1.5;
  let maxL = 6 + forceLevel * 1.2;
  let usedKg = 0;
  let usedL = 0;
  for (const { name, qty } of inventory) {
    const it = getItem(name);
    usedKg += it.kg * qty;
    usedL += it.l * qty;
    if (it.isContainer) {
      maxKg += (it.extraKg ?? 0) * qty;
      maxL += (it.extraL ?? 0) * qty;
    }
  }
  if (hasWarehouse) { maxKg += 20; maxL += 25; }
  return {
    maxKg: round1(maxKg), maxL: round1(maxL),
    usedKg: round1(usedKg), usedL: round1(usedL),
    over: usedKg > maxKg + 0.01 || usedL > maxL + 0.01,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Habilidades efectivas: XP base − lesiones − enfermedades − modificadores
// ─────────────────────────────────────────────────────────────────────────────
export interface SkillView { xp: number; base: number; level: number; penalty: number }

export function skillPenalties(state: Pick<GameState, 'injuries' | 'diseases' | 'modifiers'>): Record<string, number> {
  const pen: Record<string, number> = {};
  const add = (skill: string, amount: number) => { pen[skill] = (pen[skill] ?? 0) + amount; };

  for (const inj of state.injuries) {
    for (const s of INJURY_ZONES[inj.zone].skills) add(s, inj.severity);
  }
  for (const d of state.diseases) {
    const mod = DISEASES[d.id].stages[d.stage].skillMod ?? 0;
    if (mod) for (const s of ALL_SKILLS) add(s, mod);
  }
  for (const m of state.modifiers) {
    for (const [skill, amount] of Object.entries(m.skills)) {
      if (skill === '*') { for (const s of ALL_SKILLS) add(s, -amount); }
      else add(skill, -amount);
    }
  }
  return pen;
}

export function skillView(state: GameState): Record<string, SkillView> {
  const pen = skillPenalties(state);
  const out: Record<string, SkillView> = {};
  for (const s of ALL_SKILLS) {
    const xp = state.skillXp[s] ?? 0;
    const base = xpToLevel(xp);
    const penalty = pen[s] ?? 0;
    out[s] = { xp, base, level: Math.max(1, base - penalty), penalty };
  }
  return out;
}

export function effectiveLevel(state: GameState, skill: string): number {
  const pen = skillPenalties(state)[skill] ?? 0;
  return Math.max(1, xpToLevel(state.skillXp[skill] ?? 0) - pen);
}

// ─────────────────────────────────────────────────────────────────────────────
// Necesidades
// ─────────────────────────────────────────────────────────────────────────────
export interface NeedsTick { needs: Needs; hpDelta: number; warnings: string[] }

/** Consumo por el paso del tiempo + lo que el turno haya aportado. */
export function tickNeeds(
  prev: Needs, minutes: number, traits: string[], diseases: ActiveDisease[],
  delta: { hunger?: number; thirst?: number; sleep?: number; temp?: number } = {},
): NeedsTick {
  const hours = minutes / 60;
  const t = (id: string) => traits.includes(id);

  const hungerRate = 4 * (t('gloton') ? 1.5 : 1) * (t('metabolismo_lento') ? 0.7 : 1);
  const thirstRate = 7 * (t('sediento') ? 2 : 1) * (t('metabolismo_lento') ? 0.7 : 1);
  const sleepRate = 3;

  let hunger = prev.hunger - hours * hungerRate + (delta.hunger ?? 0);
  let thirst = prev.thirst - hours * thirstRate + (delta.thirst ?? 0);
  let sleep = prev.sleep - hours * sleepRate + (delta.sleep ?? 0);
  let temp = prev.temp + (delta.temp ?? 0);

  // Las enfermedades gravan las necesidades por hora.
  for (const d of diseases) {
    const st = DISEASES[d.id].stages[d.stage];
    hunger += st.hungerMod * hours;
    thirst += st.thirstMod * hours;
    sleep += st.sleepMod * hours;
  }

  // La temperatura corporal vuelve despacio a 36.5 °C.
  const drift = clamp((36.5 - temp) * Math.min(1, hours / 6), -2, 2);
  temp += drift;

  const needs: Needs = {
    hunger: clamp(hunger, 0, 100),
    thirst: clamp(thirst, 0, 100),
    sleep: clamp(sleep, 0, 100),
    temp: clamp(round1(temp), 30, 43),
  };

  // Daño por carencias extremas, proporcional al tiempo transcurrido.
  let hpDelta = 0;
  const warnings: string[] = [];
  if (needs.thirst <= 0) { hpDelta -= 4 * hours; warnings.push('Deshidratación severa: estás perdiendo vida.'); }
  else if (needs.thirst < 12) warnings.push('Tienes una sed peligrosa. Bebe algo.');
  if (needs.hunger <= 0) { hpDelta -= 2.5 * hours; warnings.push('Inanición: tu cuerpo se está consumiendo.'); }
  else if (needs.hunger < 12) warnings.push('El hambre te está debilitando.');
  if (needs.sleep <= 0) { hpDelta -= 1.5 * hours; warnings.push('Llevas demasiado sin dormir.'); }
  if (needs.temp <= 33) { hpDelta -= 3 * hours; warnings.push('Hipotermia. Necesitas calor ya.'); }
  if (needs.temp >= 40) { hpDelta -= 3 * hours; warnings.push('Hipertermia. Necesitas sombra y agua.'); }

  // Enfermedades: daño por hora.
  for (const d of diseases) hpDelta += DISEASES[d.id].stages[d.stage].hpPerHour * hours;

  return { needs, hpDelta: Math.round(hpDelta), warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enfermedades y lesiones
// ─────────────────────────────────────────────────────────────────────────────
export interface DiseaseTick { diseases: ActiveDisease[]; messages: string[] }

export function progressDiseases(list: ActiveDisease[], minutes: number): DiseaseTick {
  const messages: string[] = [];
  const out: ActiveDisease[] = [];
  for (const d of list) {
    const def = DISEASES[d.id];
    // Un descanso largo cura el estadio leve de lo que sea curable descansando.
    if (def.restCures && d.stage === 0 && minutes >= 300) {
      messages.push(`El descanso ha bastado para superar: ${def.label}.`);
      continue;
    }
    const ticks = d.ticks + 1;
    if (ticks >= def.progressEvery && d.stage < 2) {
      const stage = (d.stage + 1) as 0 | 1 | 2;
      messages.push(`Tu ${def.label.toLowerCase()} ha empeorado a ${def.stages[stage].label.toLowerCase()}. ${def.stages[stage].desc}`);
      out.push({ id: d.id, stage, ticks: 0 });
    } else {
      out.push({ ...d, ticks });
    }
  }
  return { diseases: out, messages };
}

/** Riesgos ambientales que pueden generar enfermedad por sí solos. */
export function naturalDiseaseRisk(
  state: GameState, minutes: number, rng: () => number,
): { add: ActiveDisease[]; messages: string[] } {
  const add: ActiveDisease[] = [];
  const messages: string[] = [];
  const has = (id: ActiveDisease['id']) => state.diseases.some((d) => d.id === id);
  const resist = state.traits.includes('inmunidad_natural') ? 0.5 : 1;
  const hours = minutes / 60;

  if (state.needs.sleep <= 0 && !has('exhaustion')) {
    add.push({ id: 'exhaustion', stage: 0, ticks: 0 });
    messages.push('Tu cuerpo se rinde: has desarrollado agotamiento crónico.');
  }
  const treated = state.inventory.some((s) => s.name === 'Antibióticos' || s.name === 'Botiquín completo');
  if (state.injuries.length > 0 && !treated && !has('wound_infection')) {
    if (rng() < 0.12 * resist * Math.min(3, hours)) {
      add.push({ id: 'wound_infection', stage: 0, ticks: 0 });
      messages.push('Una de tus heridas se ha infectado.');
    }
  }
  if (state.needs.temp <= 34.5 && !has('respiratory')) {
    if (rng() < 0.15 * resist) {
      add.push({ id: 'respiratory', stage: 0, ticks: 0 });
      messages.push('El frío se te ha metido en el pecho: infección respiratoria.');
    }
  }
  return { add, messages };
}

/** Curación natural de lesiones con el paso del tiempo. */
export function healInjuries(injuries: Injury[], minutes: number, traits: string[]): { injuries: Injury[]; messages: string[] } {
  const speed = traits.includes('cicatrizacion') ? 2 : 1;
  const messages: string[] = [];
  const out: Injury[] = [];
  for (const inj of injuries) {
    const age = inj.age + (minutes / 60) * speed;
    // Umbral por gravedad: 14 h leve, 40 h moderada, 90 h grave.
    const threshold = inj.severity === 1 ? 14 : inj.severity === 2 ? 40 : 90;
    if (age >= threshold) {
      if (inj.severity === 1) {
        messages.push(`Tu lesión en ${INJURY_ZONES[inj.zone].label.toLowerCase()} ha terminado de sanar.`);
        continue;
      }
      const severity = (inj.severity - 1) as 1 | 2;
      messages.push(`Tu lesión en ${INJURY_ZONES[inj.zone].label.toLowerCase()} mejora: ahora es ${severity === 1 ? 'leve' : 'moderada'}.`);
      out.push({ ...inj, severity, age: 0 });
    } else {
      out.push({ ...inj, age });
    }
  }
  return { injuries: out, messages };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modificadores temporales
// ─────────────────────────────────────────────────────────────────────────────
export function tickModifiers(mods: Modifier[]): { modifiers: Modifier[]; expired: Modifier[] } {
  const modifiers: Modifier[] = [];
  const expired: Modifier[] = [];
  for (const m of mods) {
    const turns = m.turns - 1;
    if (turns <= 0) expired.push(m);
    else modifiers.push({ ...m, turns });
  }
  return { modifiers, expired };
}

export function upsertModifier(mods: Modifier[], mod: Modifier): Modifier[] {
  const rest = mods.filter((m) => m.id !== mod.id);
  return [...rest, mod];
}

// ─────────────────────────────────────────────────────────────────────────────
// Vida máxima e inicialización de ficha
// ─────────────────────────────────────────────────────────────────────────────
export function maxHpFor(traits: string[]): number {
  let hp = 100;
  if (traits.includes('robusto')) hp += 20;
  if (traits.includes('debil')) hp -= 20;
  return hp;
}

export function startingSkillLevels(
  bonuses: Record<string, number>, penalties: Record<string, number>, traits: string[],
): Record<string, number> {
  const levels: Record<string, number> = Object.fromEntries(ALL_SKILLS.map((s) => [s, 1]));
  const apply = (map: Record<string, number>) => {
    for (const [k, v] of Object.entries(map)) {
      if (k in levels) levels[k] = clamp(levels[k] + v, 1, 10);
    }
  };
  apply(bonuses);
  apply(penalties);
  for (const id of traits) {
    const t = TRAIT_BY_ID[id];
    if (t?.skillBonus) apply(t.skillBonus);
    if (t?.skillPenalty) apply(t.skillPenalty);
  }
  return levels;
}
