import { ITEM_NAMES, MATERIAL_IDS, VALID_TAGS, estimateItem, isKnownItem } from '../data/items';
import { RECIPE_BY_ID } from '../data/recipes';
import { ALL_SKILLS } from '../data/skills';
import { DISEASE_IDS } from '../data/conditions';
import { INJURY_ZONE_IDS } from '../data/skills';
import { clamp } from '../engine/rules';
import type {
  DiseaseId, ImprovisePlan, InjuryZone, ItemDef, Stack, TurnResult, ZoneType,
} from '../engine/types';

const ZONE_TYPES: ZoneType[] = ['urban', 'wilderness', 'indoor', 'underground', 'water'];

/**
 * Extrae el primer objeto JSON completo de un texto que puede venir con
 * ```fences```, prosa alrededor o llaves dentro de cadenas.
 */
export function extractJson(raw: string): unknown {
  if (!raw) return null;
  const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* seguimos buscando */ }

  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

const asNumber = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v.trim() : fallback;

/** Empareja un nombre libre con el catálogo real, tolerando mayúsculas y tildes. */
const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const ITEM_INDEX = new Map(ITEM_NAMES.map((n) => [normalize(n), n]));

/**
 * Empareja un nombre libre con algo que exista de verdad: el catálogo base o
 * los objetos que hayan aparecido durante esta partida.
 */
export function matchItemName(raw: string, known: string[] = []): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (isKnownItem(name)) return name;
  if (known.includes(name)) return name;

  const n = normalize(name);
  const exact = ITEM_INDEX.get(n);
  if (exact) return exact;
  for (const k of known) if (normalize(k) === n) return k;

  // Coincidencia parcial: "botiquin" → "Botiquín pequeño".
  if (n.length < 4) return null;
  for (const k of known) {
    const kn = normalize(k);
    if (kn.includes(n) || n.includes(kn)) return k;
  }
  for (const [key, value] of ITEM_INDEX) {
    if (key.includes(n) || n.includes(key)) return value;
  }
  return null;
}

/** Nombre limpio para un objeto que el mundo acaba de inventar. */
function cleanItemName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 42);
  if (name.length < 2) return null;
  if (/^[\d\s.,;:_-]+$/.test(name)) return null;
  return name[0].toUpperCase() + name.slice(1);
}

/**
 * Valida los objetos que el mundo introduce. El modelo propone nombre, peso,
 * volumen y etiquetas; aquí se acota todo a rangos plausibles y, si los números
 * vienen absurdos o ausentes, se usa la estimación por palabra clave.
 */
export function asNewItems(v: unknown, existing: string[], limit = 3): (ItemDef & { name: string })[] {
  if (!Array.isArray(v)) return [];
  const out: (ItemDef & { name: string })[] = [];
  for (const raw of v.slice(0, limit)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const name = cleanItemName(asString(o.name));
    if (!name) continue;
    if (isKnownItem(name) || existing.includes(name) || out.some((i) => i.name === name)) continue;
    // Si ya se parece mucho a algo del catálogo, no creamos un duplicado.
    if (matchItemName(name, existing)) continue;

    const guess = estimateItem(name);
    const kgRaw = asNumber(o.kg, NaN);
    const lRaw = asNumber(o.l, NaN);
    const kg = Number.isFinite(kgRaw) && kgRaw > 0 ? clamp(kgRaw, 0.005, 40) : guess.kg;
    const l = Number.isFinite(lRaw) && lRaw > 0 ? clamp(lRaw, 0.005, 60) : guess.l;

    const tags = Array.isArray(o.tags)
      ? (o.tags as unknown[]).filter((t): t is string => typeof t === 'string')
          .map((t) => t.trim().toLowerCase())
          .filter((t) => VALID_TAGS.includes(t))
          .slice(0, 5)
      : guess.tags;

    const materials: Record<string, number> = {};
    if (o.materials && typeof o.materials === 'object') {
      for (const [k, val] of Object.entries(o.materials as Record<string, unknown>)) {
        const cls = k.trim().toLowerCase();
        if (!MATERIAL_IDS.includes(cls)) continue;
        materials[cls] = clamp(asNumber(val, 0.2), 0, 0.6);
        if (Object.keys(materials).length >= 4) break;
      }
    }

    out.push({
      name,
      kg: Math.round(kg * 1000) / 1000,
      l: Math.round(l * 1000) / 1000,
      tags: tags.length ? tags : guess.tags,
      desc: asString(o.desc).slice(0, 120) || undefined,
      materials: Object.keys(materials).length ? materials : undefined,
      improvised: true,
    });
  }
  return out;
}

/** Recetas del catálogo que el personaje acaba de aprender. */
function asRecipesLearned(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  const out: string[] = [];
  for (const raw of list.slice(0, 6)) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (RECIPE_BY_ID[id]) { out.push(id); continue; }
    const n = normalize(id);
    const found = Object.keys(RECIPE_BY_ID).find((r) => normalize(r) === n);
    if (found) out.push(found);
  }
  return [...new Set(out)];
}

function asStacks(v: unknown, known: string[], limit = 6): Stack[] {
  if (!Array.isArray(v)) return [];
  const out: Stack[] = [];
  for (const raw of v.slice(0, limit)) {
    if (typeof raw === 'string') {
      const name = matchItemName(raw, known);
      if (name) out.push({ name, qty: 1 });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const name = matchItemName(asString(obj.name), known);
    if (!name) continue;
    const existing = out.find((o) => o.name === name);
    const qty = clamp(Math.round(asNumber(obj.qty, 1)), 1, 20);
    if (existing) existing.qty += qty;
    else out.push({ name, qty });
  }
  return out;
}

function asSkillXp(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, number> = {};
  let count = 0;
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    if (count >= 4) break;
    const skill = ALL_SKILLS.find((s) => normalize(s) === normalize(k));
    if (!skill) continue;
    const gain = clamp(Math.round(asNumber(raw, 0)), 0, 5);
    if (gain > 0) { out[skill] = gain; count++; }
  }
  return out;
}

function asInjuries(v: unknown): TurnResult['injuriesUpdate'] {
  if (!Array.isArray(v)) return [];
  const out: TurnResult['injuriesUpdate'] = [];
  for (const raw of v.slice(0, 3)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const zone = asString(o.zone) as InjuryZone;
    if (!INJURY_ZONE_IDS.includes(zone)) continue;
    const action = asString(o.action) === 'remove' ? 'remove' : 'add';
    out.push({
      zone,
      severity: clamp(Math.round(asNumber(o.severity, 1)), 1, 3) as 1 | 2 | 3,
      label: asString(o.label).slice(0, 80) || 'Herida',
      action,
    });
  }
  return out;
}

function asDiseases(v: unknown): TurnResult['diseasesUpdate'] {
  if (!Array.isArray(v)) return [];
  const out: TurnResult['diseasesUpdate'] = [];
  for (const raw of v.slice(0, 3)) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const id = asString(o.id) as DiseaseId;
    if (!DISEASE_IDS.includes(id)) continue;
    out.push({
      id,
      action: asString(o.action) === 'remove' ? 'remove' : 'add',
      cause: asString(o.cause).slice(0, 80) || undefined,
    });
  }
  return out;
}

function asSuggestions(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim().slice(0, 90))
    .filter(Boolean)
    .slice(0, 4);
}

/**
 * Cuando el modelo se queda sin tokens devuelve JSON cortado a medias. Antes
 * ese texto entraba tal cual en el relato, con sus llaves y sus comillas.
 * Aquí se intenta rescatar solo el valor de `narrative`; si no hay forma, se
 * descarta lo que huela a JSON.
 */
export function rescueNarrative(raw: string): string | null {
  const limpio = raw.replace(/```(?:json)?/gi, '').trim();
  if (!limpio) return null;

  // Valor de "narrative" aunque la cadena esté sin cerrar.
  const m = limpio.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (m?.[1]) {
    const texto = m[1]
      .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      .trim();
    if (texto.length > 20) return texto.slice(0, 4000);
  }

  // Sin narrative rescatable: si parece JSON, no es narración.
  if (limpio.startsWith('{') || limpio.startsWith('[') || /"\w+"\s*:/.test(limpio)) return null;
  return limpio.length > 20 ? limpio.slice(0, 2000) : null;
}

export interface ParseOutcome {
  result: TurnResult | null;
  /** Texto libre recuperado cuando el JSON viene roto pero hay narrativa. */
  fallbackNarrative: string | null;
}

/** Convierte la respuesta del modelo en un TurnResult seguro y acotado. */
export function parseTurn(raw: string, fallbackZone: string, known: string[] = []): ParseOutcome {
  const data = extractJson(raw);
  if (!data || typeof data !== 'object') {
    return { result: null, fallbackNarrative: rescueNarrative(raw) };
  }
  const o = data as Record<string, unknown>;
  const narrative = asString(o.narrative) || asString(o.text) || asString(o.story);
  if (!narrative) {
    return { result: null, fallbackNarrative: null };
  }

  // Los objetos nuevos se validan primero: lo que el mundo acaba de inventar
  // tiene que existir antes de que `itemsGained` pueda referirse a ello.
  const newItems = asNewItems(o.newItems, known);
  const catalogNames = [...known, ...newItems.map((i) => i.name)];

  const mapRaw = o.mapUpdate && typeof o.mapUpdate === 'object' ? (o.mapUpdate as Record<string, unknown>) : null;
  const zoneName = asString(mapRaw?.currentZone) || asString(o.location) || fallbackZone;
  const type = asString(mapRaw?.type) as ZoneType;

  return {
    result: {
      narrative: narrative.slice(0, 4000),
      hpChange: clamp(Math.round(asNumber(o.hpChange)), -60, 40),
      itemsGained: asStacks(o.itemsGained, catalogNames),
      itemsLost: asStacks(o.itemsLost, catalogNames),
      skillXp: asSkillXp(o.skillXp),
      timeMinutes: clamp(Math.round(asNumber(o.timeMinutes, 10)), 1, 720),
      hungerChange: clamp(Math.round(asNumber(o.hungerChange)), -40, 60),
      thirstChange: clamp(Math.round(asNumber(o.thirstChange)), -40, 60),
      sleepChange: clamp(Math.round(asNumber(o.sleepChange)), -40, 80),
      tempChange: clamp(asNumber(o.tempChange), -5, 5),
      sceneDescription: asString(o.sceneDescription).slice(0, 200),
      location: (asString(o.location) || zoneName).slice(0, 60),
      injuriesUpdate: asInjuries(o.injuriesUpdate),
      diseasesUpdate: asDiseases(o.diseasesUpdate),
      mapUpdate: zoneName
        ? {
            currentZone: zoneName.slice(0, 60),
            type: ZONE_TYPES.includes(type) ? type : 'urban',
            danger: clamp(Math.round(asNumber(mapRaw?.danger, 1)), 1, 5),
            connections: Array.isArray(mapRaw?.connections)
              ? (mapRaw!.connections as unknown[])
                  .filter((c): c is string => typeof c === 'string')
                  .map((c) => c.trim().slice(0, 60))
                  .filter(Boolean)
                  // Dos como mucho: el mapa se llenaba de zonas fantasma.
                  .slice(0, 2)
              : [],
          }
        : null,
      suggestions: asSuggestions(o.suggestions),
      sheltered: typeof o.sheltered === 'boolean' ? o.sheltered : null,
      newItems,
      recipesLearned: asRecipesLearned(o.recipesLearned),
    },
    fallbackNarrative: null,
  };
}

/**
 * Valida la propuesta de fabricación improvisada. El modelo juzga si la idea es
 * plausible y con qué; el motor decide si sale bien (ver `engine/reducer.ts`).
 */
export function parseImprovise(raw: string, known: string[]): ImprovisePlan | null {
  const data = extractJson(raw);
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;

  const narrative = asString(o.narrative).slice(0, 1200);
  const reason = asString(o.reason).slice(0, 240);
  const feasible = o.feasible === true || o.feasible === 'true';
  if (!feasible) {
    return {
      feasible: false, reason: reason || 'No hay forma de hacer eso con lo que llevas.',
      consumes: [], produces: [], newItems: [], minutes: 0, difficulty: 1, skill: null,
      narrative,
    };
  }

  const newItems = asNewItems(o.newItems, known, 2);
  const catalogNames = [...known, ...newItems.map((i) => i.name)];
  const produces = asStacks(o.produces, catalogNames, 3);
  if (!produces.length) return null;

  const skillRaw = asString(o.skill);
  const skill = ALL_SKILLS.find((sk) => normalize(sk) === normalize(skillRaw)) ?? null;

  return {
    feasible: true,
    reason,
    consumes: asStacks(o.consumes, known, 5),
    produces,
    newItems,
    minutes: clamp(Math.round(asNumber(o.minutes, 20)), 1, 480),
    difficulty: clamp(asNumber(o.difficulty, 0.3), 0, 0.95),
    skill,
    narrative,
  };
}

/** Turno neutro: se usa si el modelo falla y hay que dejar seguir la partida. */
export function neutralTurn(narrative: string, zone: string): TurnResult {
  return {
    narrative,
    hpChange: 0, itemsGained: [], itemsLost: [], skillXp: {},
    timeMinutes: 10, hungerChange: 0, thirstChange: 0, sleepChange: 0, tempChange: 0,
    sceneDescription: '', location: zone,
    injuriesUpdate: [], diseasesUpdate: [], mapUpdate: null, suggestions: [],
    sheltered: null, newItems: [], recipesLearned: [],
  };
}
