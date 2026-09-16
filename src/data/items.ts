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
  'Hacha de mano':      { kg: 1.2, l: 1.0, tags: ['weapon', 'tool'], materials: { filo: 0.15 } },
  'Cuchillo':           { kg: 0.3, l: 0.2, tags: ['weapon', 'tool'], materials: { filo: 0 } },
  'Machete':            { kg: 0.7, l: 0.5, tags: ['weapon'], materials: { filo: 0.05 } },
  'Bate de béisbol':    { kg: 0.9, l: 1.2, tags: ['weapon'], materials: { madera: 0.15 } },
  'Arco':               { kg: 0.8, l: 2.5, tags: ['weapon'] },
  'Lanza improvisada':  { kg: 1.1, l: 3.0, tags: ['weapon'] },
  'Pico':               { kg: 2.5, l: 3.0, tags: ['tool', 'weapon'], materials: { metal: 0.25, herramienta: 0.3 } },
  'Explosivo casero':   { kg: 0.8, l: 0.9, tags: ['weapon', 'craft'] },

  // ── Munición ─────────────────────────────────────────────────────────────
  'Cargador 9mm':             { kg: 0.3, l: 0.15, tags: ['ammo'] },
  'Cartuchos escopeta x10':   { kg: 0.4, l: 0.30, tags: ['ammo'] },
  'Flechas x10':              { kg: 0.4, l: 0.80, tags: ['ammo'] },

  // ── Médico ───────────────────────────────────────────────────────────────
  'Botiquín completo': {
    kg: 1.5, l: 2.0, tags: ['medical'],
    use: { hp: 28, healInjury: 2, cures: ['wound_infection'], minutes: 25, verb: 'Usar' },
  },
  'Botiquín pequeño': {
    kg: 0.6, l: 0.8, tags: ['medical'],
    use: { hp: 18, healInjury: 1, minutes: 12, verb: 'Usar' },
  },
  'Morfina': {
    kg: 0.1, l: 0.1, tags: ['medical'],
    use: { hp: 12, sleep: -5, minutes: 3, verb: 'Inyectar' },
  },
  'Bisturí':      { kg: 0.1, l: 0.1, tags: ['medical', 'tool'], materials: { filo: 0.05 } },
  'Vendas x5': {
    kg: 0.2, l: 0.3, tags: ['medical'], materials: { tela: 0.1 },
    use: { hp: 8, healInjury: 1, minutes: 8, verb: 'Vendar' },
  },
  'Antibióticos': {
    kg: 0.1, l: 0.1, tags: ['medical'],
    use: { cures: ['wound_infection', 'fever', 'respiratory'], minutes: 5, verb: 'Tomar' },
  },
  'Carbón activado': {
    kg: 0.1, l: 0.1, tags: ['medical', 'cure'],
    use: { curesNow: ['food_poison'], minutes: 5, verb: 'Tomar' },
  },
  'Yoduro de potasio': {
    kg: 0.05, l: 0.05, tags: ['medical', 'cure'],
    use: { curesNow: ['radiation'], minutes: 5, verb: 'Tomar' },
  },
  'Suero oral': {
    kg: 0.2, l: 0.25, tags: ['medical', 'cure', 'water'],
    use: { thirst: 40, hunger: 8, cures: ['food_poison'], minutes: 8, verb: 'Beber' },
  },
  'Alcohol': {
    kg: 0.5, l: 0.5, tags: ['medical', 'cure'], materials: { combustible: 0.1, antiseptico: 0.1 },
    use: { hp: -3, sleep: 10, temp: 0.3, minutes: 5, verb: 'Beber' },
  },
  'Sedante animal': { kg: 0.2, l: 0.2, tags: ['medical'] },
  'Materiales químicos': { kg: 1.5, l: 2.0, tags: ['craft', 'medical'], materials: { reactivo: 0 } },

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
    kg: 0.6, l: 0.6, tags: ['water'], materials: { recipiente: 0 },
    use: { thirst: 45, minutes: 4, verb: 'Beber' },
  },
  'Antorcha': {
    kg: 0.6, l: 1.2, tags: ['tool', 'light', 'fire'], materials: { ignicion: 0.1, combustible: 0.15 },
    desc: 'Arde una hora larga. No necesita pilas, pero hay que llevarla en la mano.',
  },
  'Caldo caliente': {
    kg: 0.5, l: 0.5, tags: ['food'],
    use: { hunger: 30, thirst: 22, hp: 4, minutes: 15, verb: 'Beber' },
    desc: 'Reconforta más de lo que alimenta, y a veces eso es justo lo que hace falta.',
  },
  'Tablones': {
    kg: 1.8, l: 3.0, tags: ['craft'], materials: { madera: 0, combustible: 0.15 },
    desc: 'Cortados a medida y listos para levantar algo.',
  },
  'Ración sellada': {
    kg: 0.45, l: 0.5, tags: ['food'],
    use: { hunger: 42, thirst: 2, minutes: 10, verb: 'Comer' },
    desc: 'Aguanta meses. Sabe a cartón, pero llena.',
  },
  'Carne curada': {
    kg: 0.3, l: 0.3, tags: ['food'],
    use: { hunger: 28, thirst: -6, minutes: 8, verb: 'Comer' },
  },

  // ── Herramientas ─────────────────────────────────────────────────────────
  'Linterna':             { kg: 0.4, l: 0.5, tags: ['tool', 'light', 'electronic'] },
  'Mechero':              { kg: 0.05, l: 0.05, tags: ['tool', 'fire'], materials: { ignicion: 0 } },
  'Cuerda (5m)':          { kg: 0.5, l: 0.8, tags: ['tool'], materials: { atadura: 0 } },
  'Mapa de la zona':      { kg: 0.05, l: 0.1, tags: ['tool', 'nav'] },
  'Reloj de pulsera':     { kg: 0.05, l: 0.05, tags: ['tool', 'clock', 'electronic'] },
  'Brújula':              { kg: 0.1, l: 0.1, tags: ['tool', 'nav'] },
  'Navaja multiusos':     { kg: 0.2, l: 0.15, tags: ['tool', 'weapon'], materials: { filo: 0.05, herramienta: 0.2 } },
  'Radio walkie-talkie':  { kg: 0.5, l: 0.6, tags: ['tool', 'electronic'] },
  'Kit de reparación':    { kg: 1.0, l: 1.2, tags: ['tool', 'craft'], materials: { herramienta: 0.1, adhesivo: 0.15, metal: 0.2 } },
  'Herramientas básicas': { kg: 2.0, l: 2.5, tags: ['tool', 'craft'], materials: { herramienta: 0 } },
  'Semillas variadas':    { kg: 0.3, l: 0.4, tags: ['craft', 'food'] },
  'Trampa metálica':      { kg: 1.5, l: 1.8, tags: ['tool', 'weapon'] },
  'Caña de pescar':       { kg: 0.4, l: 2.0, tags: ['tool'] },
  'Libreta y lápiz':      { kg: 0.15, l: 0.2, tags: ['tool'] },
  'Ganzúas':              { kg: 0.1, l: 0.1, tags: ['tool'] },
  'Chatarra':             { kg: 0.8, l: 0.8, tags: ['craft'], materials: { metal: 0 } },
  'Cinta adhesiva':       { kg: 0.2, l: 0.2, tags: ['craft'], materials: { adhesivo: 0, atadura: 0.15 } },
  'Pegamento':            { kg: 0.15, l: 0.1, tags: ['craft'], materials: { adhesivo: 0 } },
  'Resina de pino':       { kg: 0.3, l: 0.25, tags: ['craft'], materials: { adhesivo: 0.25, combustible: 0.2 } },
  'Alambre':              { kg: 0.3, l: 0.2, tags: ['craft'], materials: { atadura: 0.1, metal: 0.2 } },
  'Aguja e hilo':         { kg: 0.05, l: 0.05, tags: ['craft', 'tool'], materials: { costura: 0, atadura: 0.35 } },
  'Trapos':               { kg: 0.3, l: 0.6, tags: ['craft'], materials: { tela: 0.1, combustible: 0.2 } },
  'Pedernal':             { kg: 0.1, l: 0.05, tags: ['tool', 'fire'], materials: { ignicion: 0.2 } },
  'Tela':                 { kg: 0.2, l: 0.4, tags: ['craft'], materials: { tela: 0, atadura: 0.2 } },
  'Madera':               { kg: 1.5, l: 2.5, tags: ['craft'], materials: { madera: 0, combustible: 0.1 } },

  // ── Libros ───────────────────────────────────────────────────────────────
  'Manual de medicina':   { kg: 0.6, l: 0.8, tags: ['book'] },
  'Manual de ingeniería': { kg: 0.7, l: 0.9, tags: ['book'] },
  'Biblia':               { kg: 0.5, l: 0.6, tags: ['book'] },

  // ── Contenedores y ropa ──────────────────────────────────────────────────
  'Mochila pequeña': { kg: 0.5, l: 0.8, isContainer: true, extraKg: 8,  extraL: 10, tags: ['container'] },
  'Mochila grande':  { kg: 1.2, l: 1.5, isContainer: true, extraKg: 18, extraL: 25, tags: ['container'] },
  'Bolsa de lona':   { kg: 0.3, l: 0.5, isContainer: true, extraKg: 10, extraL: 15, tags: ['container'] },
  'Chaqueta de cuero': { kg: 1.8, l: 2.5, tags: ['clothing', 'warm'], materials: { tela: 0.25 } },
  'Ropa de abrigo':    { kg: 1.0, l: 1.5, tags: ['clothing', 'warm'], materials: { tela: 0.15 } },
};

/**
 * Catálogo ampliado en tiempo de partida. El mundo puede introducir objetos que
 * no están aquí (una colilla, una chapa, el cuaderno de otro) y se guardan en
 * `state.customItems`, no en este módulo.
 */
export type ItemCatalog = Record<string, ItemDef>;

/**
 * Pesos y volúmenes aproximados por palabra clave. Red de seguridad para cuando
 * aparece algo de lo que no sabemos nada: mejor una estimación razonable que
 * 0,3 kg genéricos para todo, desde una colilla hasta un motor.
 */
const SIZE_HINTS: [RegExp, number, number, string[]][] = [
  [/colilla|cerilla|chapa|moneda|clip|bot[oó]n|pila|anillo|llave|sello|dado/i, 0.01, 0.01, ['junk']],
  [/papel|nota|carta|foto|ticket|recibo|billete|etiqueta|plano/i, 0.02, 0.03, []],
  [/frasco|vial|ampolla|pastilla|jeringa|dosis|venda/i, 0.1, 0.1, ['medical']],
  [/cuchill|navaja|hoja|punz[oó]n|destornillador|cincel|tijera/i, 0.3, 0.2, ['tool']],
  [/botella|cantimplora|termo|bid[oó]n|garrafa|cubo/i, 0.7, 0.8, ['container']],
  [/lata|conserva|bote|tarro|raci[oó]n/i, 0.4, 0.5, ['food']],
  [/libro|manual|diario|cuaderno|libreta|tomo|tratado/i, 0.6, 0.8, ['book']],
  [/linterna|radio|walkie|c[aá]mara|reloj|bater[ií]a|m[oó]vil|tel[eé]fono/i, 0.4, 0.5, ['electronic']],
  [/camisa|camiseta|pantal[oó]n|abrigo|chaqueta|manta|saco|bufanda|guante|bota/i, 0.8, 1.5, ['clothing']],
  [/mochila|bolsa|petate|zurr[oó]n|morral|maleta/i, 0.6, 1.0, ['container']],
  [/tabl[oó]n|tabla|viga|palo|rama|tronco|listón/i, 1.5, 2.5, ['craft']],
  [/martillo|llave inglesa|sierra|taladro|palanca|pala|azada/i, 1.4, 1.2, ['tool']],
  [/rifle|escopeta|fusil|ballesta|arco largo/i, 3.5, 4.0, ['weapon']],
  [/pistola|rev[oó]lver|arma corta/i, 0.9, 0.8, ['weapon']],
  [/cuerda|cable|cordel|alambre|cinta|hilo|sedal/i, 0.4, 0.5, ['craft']],
  [/piedra|ladrillo|bloque|chatarra|tuber[ií]a|chapa met/i, 1.2, 0.9, ['craft']],
];

/** Estimación de peso y volumen para un objeto del que no tenemos ficha. */
export function estimateItem(name: string): ItemDef {
  for (const [re, kg, l, tags] of SIZE_HINTS) {
    if (re.test(name)) return { kg, l, tags: [...tags], improvised: true };
  }
  return { kg: 0.3, l: 0.3, tags: [], improvised: true };
}

export function getItem(name: string, extra?: ItemCatalog): ItemDef {
  return extra?.[name] ?? ITEM_DB[name] ?? estimateItem(name);
}

export function isKnownItem(name: string, extra?: ItemCatalog): boolean {
  return name in ITEM_DB || (extra ? name in extra : false);
}

export function hasTag(name: string, tag: string, extra?: ItemCatalog): boolean {
  return getItem(name, extra).tags.includes(tag);
}

export const ITEM_NAMES = Object.keys(ITEM_DB);

/** Etiquetas que el mundo puede asignar a un objeto nuevo. */
export const VALID_TAGS = [
  'weapon', 'ammo', 'medical', 'cure', 'food', 'water', 'tool', 'light', 'fire',
  'nav', 'clock', 'craft', 'book', 'container', 'clothing', 'warm', 'electronic', 'junk',
];

/** Clases de material que reconoce el sistema de sustituciones. */
export const MATERIAL_CLASSES: Record<string, { label: string; desc: string }> = {
  filo:        { label: 'Filo',        desc: 'algo con lo que cortar' },
  atadura:     { label: 'Atadura',     desc: 'cuerda, alambre, tiras de tela' },
  tela:        { label: 'Tela',        desc: 'textil, incluida la ropa que estés dispuesto a romper' },
  adhesivo:    { label: 'Adhesivo',    desc: 'pegamento, cinta, resina' },
  madera:      { label: 'Madera',      desc: 'tablones, ramas, mangos' },
  metal:       { label: 'Metal',       desc: 'chatarra, chapa, alambre grueso' },
  herramienta: { label: 'Herramienta', desc: 'con qué trabajar el material' },
  ignicion:    { label: 'Ignición',    desc: 'con qué prender fuego' },
  combustible: { label: 'Combustible', desc: 'lo que arde' },
  recipiente:  { label: 'Recipiente',  desc: 'donde contener líquido' },
  costura:     { label: 'Costura',     desc: 'aguja, hilo, grapas' },
  antiseptico: { label: 'Antiséptico', desc: 'con qué desinfectar' },
  reactivo:    { label: 'Reactivo',    desc: 'producto químico aprovechable' },
};

export const MATERIAL_IDS = Object.keys(MATERIAL_CLASSES);

/** Objetos del inventario que sirven para una clase de material, de mejor a peor. */
export function itemsForMaterial(
  inventory: { name: string; qty: number }[], material: string, extra?: ItemCatalog,
): { name: string; penalty: number }[] {
  return inventory
    .map((s) => ({ name: s.name, penalty: getItem(s.name, extra).materials?.[material] }))
    .filter((r): r is { name: string; penalty: number } => r.penalty !== undefined)
    .sort((a, b) => a.penalty - b.penalty);
}

/** Categoría visual del objeto en el inventario. */
export function itemCategory(name: string, extra?: ItemCatalog): { label: string; icon: string; order: number } {
  const t = getItem(name, extra).tags;
  if (t.includes('weapon')) return { label: 'Armas', icon: '🗡️', order: 0 };
  if (t.includes('ammo')) return { label: 'Munición', icon: '🎯', order: 1 };
  if (t.includes('medical')) return { label: 'Médico', icon: '🩺', order: 2 };
  if (t.includes('food') || t.includes('water')) return { label: 'Consumibles', icon: '🍖', order: 3 };
  if (t.includes('container') || t.includes('clothing')) return { label: 'Equipo', icon: '🎒', order: 4 };
  if (t.includes('book')) return { label: 'Lectura', icon: '📖', order: 5 };
  if (t.includes('tool') || t.includes('craft')) return { label: 'Herramientas', icon: '🔧', order: 6 };
  if (t.includes('junk')) return { label: 'Chismes', icon: '🔩', order: 7 };
  return { label: 'Otros', icon: '📦', order: 8 };
}
