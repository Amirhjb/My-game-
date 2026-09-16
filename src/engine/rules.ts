import { getItem, type ItemCatalog } from '../data/items';
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
export const round2 = (v: number) => Math.round(v * 100) / 100;

export const DAY_MINUTES = 1440;

/** Plural sencillo: `pl(1, 'acción', 'acciones')` → «1 acción». */
export function pl(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

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

export function hasTagged(list: Stack[], tag: string, catalog?: ItemCatalog): boolean {
  return list.some((s) => getItem(s.name, catalog).tags.includes(tag));
}

// ─────────────────────────────────────────────────────────────────────────────
// Capacidad de carga
// ─────────────────────────────────────────────────────────────────────────────
export interface Capacity { maxKg: number; maxL: number; usedKg: number; usedL: number; over: boolean }

export function capacityOf(
  inventory: Stack[], forceLevel: number, hasWarehouse: boolean, catalog?: ItemCatalog,
): Capacity {
  let maxKg = 8 + forceLevel * 1.5;
  let maxL = 6 + forceLevel * 1.2;
  let usedKg = 0;
  let usedL = 0;
  for (const { name, qty } of inventory) {
    const it = getItem(name, catalog);
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
    // Dos decimales: con uno solo, cuatro colillas pesaban cero.
    usedKg: round2(usedKg), usedL: round2(usedL),
    over: usedKg > maxKg + 0.01 || usedL > maxL + 0.01,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Habilidades efectivas: XP base − lesiones − enfermedades − modificadores
// ─────────────────────────────────────────────────────────────────────────────
export interface SkillView { xp: number; base: number; level: number; penalty: number }

export function skillPenalties(
  state: Pick<GameState, 'injuries' | 'diseases' | 'modifiers' | 'basePenalty'>,
): Record<string, number> {
  const pen: Record<string, number> = {};
  const add = (skill: string, amount: number) => { pen[skill] = (pen[skill] ?? 0) + amount; };

  for (const inj of state.injuries) {
    for (const s of INJURY_ZONES[inj.zone].skills) add(s, inj.severity);
  }
  for (const d of state.diseases) {
    const mod = DISEASES[d.id].stages[d.stage].skillMod ?? 0;
    if (mod) for (const s of ALL_SKILLS) add(s, mod);
  }
  // Los modificadores se declaran en positivo, igual que lesiones y
  // enfermedades: `{ Rastreo: 2 }` es «dos niveles menos». Antes se restaban,
  // y como el nivel final es base − penalización, todos los debuffs subían el
  // nivel en vez de bajarlo.
  for (const m of state.modifiers) {
    const signo = m.kind === 'buff' ? -1 : 1;
    for (const [skill, amount] of Object.entries(m.skills)) {
      if (skill === '*') { for (const s of ALL_SKILLS) add(s, amount * signo); }
      else add(skill, amount * signo);
    }
  }
  // Penalización permanente del oficio y los rasgos.
  for (const [skill, amount] of Object.entries(state.basePenalty ?? {})) add(skill, amount);
  return pen;
}

export function skillView(state: GameState): Record<string, SkillView> {
  const pen = skillPenalties(state);
  const out: Record<string, SkillView> = {};
  for (const s of ALL_SKILLS) {
    const xp = state.skillXp[s] ?? 0;
    const base = xpToLevel(xp);
    const penalty = pen[s] ?? 0;
    // Suelo en 0, no en 1: nivel 0 significa «incapaz», y es lo que hace que
    // un «−2 Cultivo» del Soldado signifique algo de verdad.
    out[s] = { xp, base, level: Math.max(0, base - penalty), penalty };
  }
  return out;
}

export function effectiveLevel(state: GameState, skill: string): number {
  const pen = skillPenalties(state)[skill] ?? 0;
  return Math.max(0, xpToLevel(state.skillXp[skill] ?? 0) - pen);
}

// ─────────────────────────────────────────────────────────────────────────────
// Necesidades
// ─────────────────────────────────────────────────────────────────────────────
export interface NeedsTick { needs: Needs; hpDelta: number; warnings: string[] }

/** Consumo por el paso del tiempo + lo que el turno haya aportado. */
/** Consumo base por hora. Bajado tras medir que la sed dominaba la partida. */
export const HUNGER_PER_HOUR = 2.6;
export const THIRST_PER_HOUR = 4.2;
export const SLEEP_PER_HOUR = 3;
/** Durmiendo el cuerpo gasta bastante menos. */
export const RESTING_UPKEEP = 0.4;

export function tickNeeds(
  prev: Needs, minutes: number, traits: string[], diseases: ActiveDisease[],
  delta: { hunger?: number; thirst?: number; sleep?: number; temp?: number } = {},
  opts: { resting?: boolean } = {},
): NeedsTick {
  const hours = minutes / 60;
  const t = (id: string) => traits.includes(id);
  const upkeep = opts.resting ? RESTING_UPKEEP : 1;

  const hungerRate = HUNGER_PER_HOUR * upkeep * (t('gloton') ? 1.5 : 1) * (t('metabolismo_lento') ? 0.7 : 1);
  const thirstRate = THIRST_PER_HOUR * upkeep * (t('sediento') ? 2 : 1) * (t('metabolismo_lento') ? 0.7 : 1);
  // Dormir es justamente lo que repone el sueño: no se descuenta aquí.
  const sleepRate = opts.resting ? 0 : SLEEP_PER_HOUR;

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

/** Horas de tratamiento necesarias para bajar un estadio de enfermedad. */
export const DISEASE_TREAT_HOURS = 10;

export function progressDiseases(list: ActiveDisease[], minutes: number): DiseaseTick {
  const messages: string[] = [];
  const out: ActiveDisease[] = [];
  const hours = minutes / 60;

  for (const d of list) {
    const def = DISEASES[d.id];
    let stage = d.stage;
    let ticks = d.ticks;
    let treated = d.treated ?? 0;
    let curado = false;

    // Tratamiento en curso: baja un estadio por cada tanda de horas.
    if (treated > 0) {
      treated += hours;
      while (treated >= DISEASE_TREAT_HOURS && !curado) {
        treated -= DISEASE_TREAT_HOURS;
        if (stage === 0) {
          messages.push(`El tratamiento ha acabado con tu ${def.label.toLowerCase()}.`);
          curado = true;
        } else {
          stage = (stage - 1) as 0 | 1 | 2;
          ticks = 0;
          messages.push(`Tu ${def.label.toLowerCase()} remite: ahora es ${def.stages[stage].label.toLowerCase()}.`);
        }
      }
      if (curado) continue;
      out.push({ id: d.id, stage, ticks, treated });
      continue;
    }

    // Un descanso largo baja un estadio de lo que se cure descansando, no solo
    // el primero: antes el agotamiento en estadio 2 era literalmente incurable.
    if (def.restCures && minutes >= 300) {
      if (stage === 0) {
        messages.push(`El descanso ha bastado para superar: ${def.label.toLowerCase()}.`);
        continue;
      }
      stage = (stage - 1) as 0 | 1 | 2;
      messages.push(`El descanso mejora tu ${def.label.toLowerCase()}: ahora es ${def.stages[stage].label.toLowerCase()}.`);
      out.push({ id: d.id, stage, ticks: 0, treated: 0 });
      continue;
    }

    // La progresión se mide en horas de juego, no en número de acciones.
    ticks += hours;
    if (ticks >= def.progressEvery && stage < 2) {
      const next = (stage + 1) as 0 | 1 | 2;
      messages.push(`Tu ${def.label.toLowerCase()} ha empeorado a ${def.stages[next].label.toLowerCase()}. ${def.stages[next].desc}`);
      out.push({ id: d.id, stage: next, ticks: 0, treated: 0 });
    } else {
      out.push({ ...d, ticks, treated: 0 });
    }
  }
  return { diseases: out, messages };
}

/** Marca enfermedades como «en tratamiento» al usar antibióticos o similares. */
export function startTreatment(list: ActiveDisease[], ids: string[]): { diseases: ActiveDisease[]; treated: string[] } {
  const treated: string[] = [];
  const diseases = list.map((d) => {
    if (!ids.includes(d.id) || (d.treated ?? 0) > 0) return d;
    treated.push(d.id);
    // Arranca con algo de crédito para que el primer uso ya se note.
    return { ...d, treated: 0.01 };
  });
  return { diseases, treated };
}

/**
 * La contaminación leve remite sola si pasas días lejos de la fuente.
 * Sin esto, cruzar un sótano radiactivo era una partida perdida sin remedio.
 */
export function remitRadiation(
  list: ActiveDisease[], minutes: number, rng: () => number,
): { diseases: ActiveDisease[]; messages: string[] } {
  const messages: string[] = [];
  const diseases: ActiveDisease[] = [];
  for (const d of list) {
    if (d.id !== 'radiation') { diseases.push(d); continue; }
    // ~2 % por hora de bajar un estadio: sin exposición nueva, el cuerpo gana.
    if (rng() < 0.02 * (minutes / 60)) {
      if (d.stage === 0) {
        messages.push('Los síntomas de la contaminación han remitido por sí solos.');
        continue;
      }
      const stage = (d.stage - 1) as 0 | 1 | 2;
      messages.push('La contaminación remite un poco: el cuerpo va limpiándose.');
      diseases.push({ ...d, stage, ticks: 0 });
      continue;
    }
    diseases.push(d);
  }
  return { diseases, messages };
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

/**
 * Ficha inicial. Las bonificaciones suben el nivel base; las penalizaciones se
 * devuelven aparte, porque sumarlas al nivel base las anulaba: todo empieza en
 * 1 y el recorte a [1,10] se las comía enteras.
 */
export function startingSkills(
  bonuses: Record<string, number>, penalties: Record<string, number>, traits: string[],
): { levels: Record<string, number>; penalty: Record<string, number> } {
  const levels: Record<string, number> = Object.fromEntries(ALL_SKILLS.map((s) => [s, 1]));
  const penalty: Record<string, number> = {};

  const subir = (map: Record<string, number>) => {
    for (const [k, v] of Object.entries(map)) {
      if (k in levels && v > 0) levels[k] = clamp(levels[k] + v, 1, 10);
    }
  };
  const bajar = (map: Record<string, number>) => {
    for (const [k, v] of Object.entries(map)) {
      if (k in levels && v < 0) penalty[k] = (penalty[k] ?? 0) - v;
    }
  };

  subir(bonuses);
  bajar(penalties);
  for (const id of traits) {
    const t = TRAIT_BY_ID[id];
    if (t?.skillBonus) subir(t.skillBonus);
    if (t?.skillPenalty) bajar(t.skillPenalty);
  }
  return { levels, penalty };
}
