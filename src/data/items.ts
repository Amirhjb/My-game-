import type { ItemDef } from '../engine/types';

/**
 * Catálogo de objetos. `use` convierte al objeto en consumible con efecto
 * determinista: el juego lo resuelve sin pedirle nada al modelo.
 */
export const ITEM_DB: Record<string, ItemDef> = {
  // ── Armas ────────────────────────────────────────────────────────────────
  'Pistola':            { kg: 0.9, l: 0.8, tags: ['weapon'] },
  'Escopeta':           { kg: 3.6, l: 3.2, tags: ['weapon'] },
  'Rifle':              { kg: 4.1, l: 5.0, tags: ['weapon'] },
  'Hacha de mano':      { kg: 1.2, l: 1.0, tags: ['weapon', 'tool'] },
  'Cuchillo':           { kg: 0.3, l: 0.2, tags: ['weapon', 'tool'] },
  'Machete':            { kg: 0.7, l: 0.5, tags: ['weapon'] },
  'Bate de béisbol':    { kg: 0.9, l: 1.2, tags: ['weapon'] },
  'Arco':               { kg: 0.8, l: 2.5, tags: ['weapon'] },
  'Lanza improvisada':  { kg: 1.1, l: 3.0, tags: ['weapon'] },
  'Pico':               { kg: 2.5, l: 3.0, tags: ['tool', 'weapon'] },
  'Explosivo casero':   { kg: 0.8, l: 0.9, tags: ['weapon', 'craft'] },

  // ── Munición ─────────────────────────────────────────────────────────────
  'Cargador 9mm':             { kg: 0.3, l: 0.15, tags: ['ammo'] },
  'Cartuchos escopeta x10':   { kg: 0.4, l: 0.30, tags: ['ammo'] },
  'Flechas x10':              { kg: 0.4, l: 0.80, tags: ['ammo'] },

  // ── Médico ───────────────────────────────────────────────────────────────
  'Botiquín completo': {
    kg: 1.5, l: 2.0, tags: ['medical'],
    use: { hp: 35, healInjury: 2, cures: ['wound_infection', 'fever', 'respiratory'], minutes: 20, verb: 'Usar' },
  },
  'Botiquín pequeño': {
    kg: 0.6, l: 0.8, tags: ['medical'],
    use: { hp: 18, healInjury: 1, minutes: 12, verb: 'Usar' },
  },
  'Morfina': {
    kg: 0.1, l: 0.1, tags: ['medical'],
    use: { hp: 12, sleep: -5, minutes: 3, verb: 'Inyectar' },
  },
  'Bisturí':      { kg: 0.1, l: 0.1, tags: ['medical', 'tool'] },
  'Vendas x5': {
    kg: 0.2, l: 0.3, tags: ['medical'],
    use: { hp: 8, healInjury: 1, minutes: 8, verb: 'Vendar' },
  },
  'Antibióticos': {
    kg: 0.1, l: 0.1, tags: ['medical'],
    use: { cures: ['wound_infection', 'fever', 'respiratory'], minutes: 2, verb: 'Tomar' },
  },
  'Carbón activado': {
    kg: 0.1, l: 0.1, tags: ['medical', 'cure'],
    use: { cures: ['food_poison'], minutes: 2, verb: 'Tomar' },
  },
  'Yoduro de potasio': {
    kg: 0.05, l: 0.05, tags: ['medical', 'cure'],
    use: { cures: ['radiation'], minutes: 2, verb: 'Tomar' },
  },
  'Suero oral': {
    kg: 0.2, l: 0.25, tags: ['medical', 'cure', 'water'],
    use: { thirst: 40, hunger: 8, cures: ['food_poison'], minutes: 5, verb: 'Beber' },
  },
  'Alcohol': {
    kg: 0.5, l: 0.5, tags: ['medical', 'cure'],
    use: { hp: -3, sleep: 10, temp: 0.3, minutes: 5, verb: 'Beber' },
  },
  'Sedante animal': { kg: 0.2, l: 0.2, tags: ['medical'] },
  'Materiales químicos': { kg: 1.5, l: 2.0, tags: ['craft', 'medical'] },

  // ── Comida y agua ────────────────────────────────────────────────────────
  'Lata de comida': {
    kg: 0.4, l: 0.5, tags: ['food'],
    use: { hunger: 35, thirst: 4, minutes: 10, verb: 'Comer' },
  },
  'Comida enlatada x3': {
    kg: 1.2, l: 1.5, tags: ['food'],
    use: { hunger: 32, thirst: 3, minutes: 10, verb: 'Comer' },
  },
  'Barrita energética': {
    kg: 0.1, l: 0.1, tags: ['food'],
    use: { hunger: 16, thirst: -4, sleep: 4, minutes: 2, verb: 'Comer' },
  },
  'Agua (500ml)': {
    kg: 0.5, l: 0.5, tags: ['water'],
    use: { thirst: 38, minutes: 3, verb: 'Beber' },
  },
  'Botella de agua': {
    kg: 0.6, l: 0.6, tags: ['water'],
    use: { thirst: 45, minutes: 4, verb: 'Beber' },
  },
  'Carne curada': {
    kg: 0.3, l: 0.3, tags: ['food'],
    use: { hunger: 28, thirst: -6, minutes: 8, verb: 'Comer' },
  },

  // ── Herramientas ─────────────────────────────────────────────────────────
  'Linterna':             { kg: 0.4, l: 0.5, tags: ['tool', 'light', 'electronic'] },
  'Mechero':              { kg: 0.05, l: 0.05, tags: ['tool', 'fire'] },
  'Cuerda (5m)':          { kg: 0.5, l: 0.8, tags: ['tool'] },
  'Mapa de la zona':      { kg: 0.05, l: 0.1, tags: ['tool', 'nav'] },
  'Reloj de pulsera':     { kg: 0.05, l: 0.05, tags: ['tool', 'clock', 'electronic'] },
  'Brújula':              { kg: 0.1, l: 0.1, tags: ['tool', 'nav'] },
  'Navaja multiusos':     { kg: 0.2, l: 0.15, tags: ['tool', 'weapon'] },
  'Radio walkie-talkie':  { kg: 0.5, l: 0.6, tags: ['tool', 'electronic'] },
  'Kit de reparación':    { kg: 1.0, l: 1.2, tags: ['tool', 'craft'] },
  'Herramientas básicas': { kg: 2.0, l: 2.5, tags: ['tool', 'craft'] },
  'Semillas variadas':    { kg: 0.3, l: 0.4, tags: ['craft', 'food'] },
  'Trampa metálica':      { kg: 1.5, l: 1.8, tags: ['tool', 'weapon'] },
  'Caña de pescar':       { kg: 0.4, l: 2.0, tags: ['tool'] },
  'Libreta y lápiz':      { kg: 0.15, l: 0.2, tags: ['tool'] },
  'Ganzúas':              { kg: 0.1, l: 0.1, tags: ['tool'] },
  'Chatarra':             { kg: 0.8, l: 0.8, tags: ['craft'] },
  'Tela':                 { kg: 0.2, l: 0.4, tags: ['craft'] },
  'Madera':               { kg: 1.5, l: 2.5, tags: ['craft'] },

  // ── Libros ───────────────────────────────────────────────────────────────
  'Manual de medicina':   { kg: 0.6, l: 0.8, tags: ['book'] },
  'Manual de ingeniería': { kg: 0.7, l: 0.9, tags: ['book'] },
  'Biblia':               { kg: 0.5, l: 0.6, tags: ['book'] },

  // ── Contenedores y ropa ──────────────────────────────────────────────────
  'Mochila pequeña': { kg: 0.5, l: 0.8, isContainer: true, extraKg: 8,  extraL: 10, tags: ['container'] },
  'Mochila grande':  { kg: 1.2, l: 1.5, isContainer: true, extraKg: 18, extraL: 25, tags: ['container'] },
  'Bolsa de lona':   { kg: 0.3, l: 0.5, isContainer: true, extraKg: 10, extraL: 15, tags: ['container'] },
  'Chaqueta de cuero': { kg: 1.8, l: 2.5, tags: ['clothing', 'warm'] },
  'Ropa de abrigo':    { kg: 1.0, l: 1.5, tags: ['clothing', 'warm'] },
};

const FALLBACK: ItemDef = { kg: 0.3, l: 0.3, tags: [] };

export function getItem(name: string): ItemDef {
  return ITEM_DB[name] ?? FALLBACK;
}

export function isKnownItem(name: string): boolean {
  return name in ITEM_DB;
}

export function hasTag(name: string, tag: string): boolean {
  return getItem(name).tags.includes(tag);
}

export const ITEM_NAMES = Object.keys(ITEM_DB);

/** Categoría visual del objeto en el inventario. */
export function itemCategory(name: string): { label: string; icon: string; order: number } {
  const t = getItem(name).tags;
  if (t.includes('weapon')) return { label: 'Armas', icon: '🗡️', order: 0 };
  if (t.includes('ammo')) return { label: 'Munición', icon: '🎯', order: 1 };
  if (t.includes('medical')) return { label: 'Médico', icon: '🩺', order: 2 };
  if (t.includes('food') || t.includes('water')) return { label: 'Consumibles', icon: '🍖', order: 3 };
  if (t.includes('container') || t.includes('clothing')) return { label: 'Equipo', icon: '🎒', order: 4 };
  if (t.includes('book')) return { label: 'Lectura', icon: '📖', order: 5 };
  if (t.includes('tool') || t.includes('craft')) return { label: 'Herramientas', icon: '🔧', order: 6 };
  return { label: 'Otros', icon: '📦', order: 7 };
}
