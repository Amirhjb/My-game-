import { ITEM_NAMES, isKnownItem } from '../data/items';
import { ALL_SKILLS } from '../data/skills';
import { DISEASE_IDS } from '../data/conditions';
import { INJURY_ZONE_IDS } from '../data/skills';
import { clamp } from '../engine/rules';
import type { DiseaseId, InjuryZone, Stack, TurnResult, ZoneType } from '../engine/types';

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

export function matchItemName(raw: string): string | null {
  const name = raw.trim();
  if (!name) return null;
  if (isKnownItem(name)) return name;
  const exact = ITEM_INDEX.get(normalize(name));
  if (exact) return exact;
  // Coincidencia parcial: "botiquin" → "Botiquín pequeño".
  const n = normalize(name);
  if (n.length < 4) return null;
  for (const [key, value] of ITEM_INDEX) {
    if (key.includes(n) || n.includes(key)) return value;
  }
  return null;
}

function asStacks(v: unknown, limit = 6): Stack[] {
  if (!Array.isArray(v)) return [];
  const out: Stack[] = [];
  for (const raw of v.slice(0, limit)) {
    if (typeof raw === 'string') {
      const name = matchItemName(raw);
      if (name) out.push({ name, qty: 1 });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const name = matchItemName(asString(obj.name));
    if (!name) continue;
    out.push({ name, qty: clamp(Math.round(asNumber(obj.qty, 1)), 1, 20) });
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

export interface ParseOutcome {
  result: TurnResult | null;
  /** Texto libre recuperado cuando el JSON viene roto pero hay narrativa. */
  fallbackNarrative: string | null;
}

/** Convierte la respuesta del modelo en un TurnResult seguro y acotado. */
export function parseTurn(raw: string, fallbackZone: string): ParseOutcome {
  const data = extractJson(raw);
  if (!data || typeof data !== 'object') {
    const text = raw.replace(/```(?:json)?/gi, '').trim();
    return { result: null, fallbackNarrative: text.length > 20 ? text.slice(0, 2000) : null };
  }
  const o = data as Record<string, unknown>;
  const narrative = asString(o.narrative) || asString(o.text) || asString(o.story);
  if (!narrative) {
    return { result: null, fallbackNarrative: null };
  }

  const mapRaw = o.mapUpdate && typeof o.mapUpdate === 'object' ? (o.mapUpdate as Record<string, unknown>) : null;
  const zoneName = asString(mapRaw?.currentZone) || asString(o.location) || fallbackZone;
  const type = asString(mapRaw?.type) as ZoneType;

  return {
    result: {
      narrative: narrative.slice(0, 4000),
      hpChange: clamp(Math.round(asNumber(o.hpChange)), -60, 40),
      itemsGained: asStacks(o.itemsGained),
      itemsLost: asStacks(o.itemsLost),
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
                  .slice(0, 4)
              : [],
          }
        : null,
      suggestions: asSuggestions(o.suggestions),
    },
    fallbackNarrative: null,
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
  };
}
