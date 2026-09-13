import type { RecipeCategory, Stack } from '../engine/types';

export interface Ingredient {
  /** Objeto ideal. Puede omitirse si el ingrediente es solo una clase de material. */
  name?: string;
  /**
   * Clase de material aceptada: `filo`, `atadura`, `tela`, `adhesivo`…
   * Cualquier objeto del inventario que cubra esa clase sirve, con la
   * penalización que tenga. Es lo que permite usar cinta donde pide pegamento.
   */
  material?: string;
  qty: number;
  /** Alternativas concretas peores: sirven, pero añaden riesgo de fallo. */
  substitutes?: { name: string; failChance: number }[];
}

/** Etiqueta legible de un ingrediente, dé lo mismo cómo esté definido. */
export function ingredientLabel(ing: Ingredient): string {
  if (ing.name) return ing.name;
  if (ing.material) return `Cualquier ${ing.material}`;
  return 'Material';
}

export interface Recipe {
  id: string;
  ingredients: Ingredient[];
  result: Stack;
  category: RecipeCategory;
  /** Habilidad y nivel mínimo. `null` = cualquiera puede. */
  skillReq: { skill: string; level: number } | null;
  /** Minutos de juego que consume. */
  minutes: number;
  /** XP concedida a la habilidad requerida al tener éxito. */
  xp: number;
  desc: string;
}

const R = (r: Omit<Recipe, 'id'> & { id: string }): Recipe => r;

export const RECIPES: Recipe[] = [
  // ── Médico ───────────────────────────────────────────────────────────────
  R({
    id: 'Vendas improvisadas',
    ingredients: [{ name: 'Tela', material: 'tela', qty: 1 }],
    result: { name: 'Vendas x5', qty: 1 },
    category: 'medico', skillReq: { skill: 'Primeros auxilios', level: 1 }, minutes: 15, xp: 3,
    desc: 'Tiras de tela limpias. Básicas, pero detienen una hemorragia.',
  }),
  R({
    id: 'Botiquín improvisado',
    ingredients: [
      { name: 'Vendas x5', qty: 1 },
      { name: 'Antibióticos', qty: 1, substitutes: [{ name: 'Alcohol', failChance: 0.2 }] },
    ],
    result: { name: 'Botiquín pequeño', qty: 1 },
    category: 'medico', skillReq: { skill: 'Primeros auxilios', level: 3 }, minutes: 30, xp: 6,
    desc: 'Un kit de emergencia montado a mano.',
  }),
  R({
    id: 'Suero de rehidratación',
    ingredients: [
      { name: 'Agua (500ml)', qty: 1 },
      { name: 'Barrita energética', qty: 1, substitutes: [{ name: 'Lata de comida', failChance: 0.15 }] },
    ],
    result: { name: 'Suero oral', qty: 1 },
    category: 'medico', skillReq: { skill: 'Primeros auxilios', level: 2 }, minutes: 20, xp: 4,
    desc: 'Sal y azúcar disueltos en agua limpia. Salva de una deshidratación.',
  }),
  R({
    id: 'Analgésico casero',
    ingredients: [
      { name: 'Alcohol', material: 'antiseptico', qty: 1 },
      { name: 'Materiales químicos', material: 'reactivo', qty: 1 },
    ],
    result: { name: 'Morfina', qty: 1 },
    category: 'medico', skillReq: { skill: 'Primeros auxilios', level: 4 }, minutes: 60, xp: 10,
    desc: 'Síntesis arriesgada de un calmante fuerte. Solo para manos expertas.',
  }),

  // ── Armas ────────────────────────────────────────────────────────────────
  R({
    id: 'Lanza de madera',
    ingredients: [
      { name: 'Madera', material: 'madera', qty: 1 },
      { name: 'Cuchillo', material: 'filo', qty: 1 },
    ],
    result: { name: 'Lanza improvisada', qty: 1 },
    category: 'arma', skillReq: { skill: 'Lanza', level: 1 }, minutes: 25, xp: 4,
    desc: 'Palo afilado y endurecido al fuego. Alcance por encima de un cuchillo.',
  }),
  R({
    id: 'Trampa de caza',
    ingredients: [
      { name: 'Cuerda (5m)', material: 'atadura', qty: 1 },
      { name: 'Chatarra', material: 'metal', qty: 1 },
    ],
    result: { name: 'Trampa metálica', qty: 1 },
    category: 'arma', skillReq: { skill: 'Trampas', level: 2 }, minutes: 40, xp: 6,
    desc: 'Lazo reforzado con muelle. Caza mientras duermes.',
  }),
  R({
    id: 'Flechas artesanales',
    ingredients: [
      { name: 'Madera', material: 'madera', qty: 1 },
      { name: 'Chatarra', material: 'metal', qty: 1 },
    ],
    result: { name: 'Flechas x10', qty: 1 },
    category: 'arma', skillReq: { skill: 'Rastreo', level: 1 }, minutes: 30, xp: 4,
    desc: 'Varas rectas con punta de metal recuperado.',
  }),
  R({
    id: 'Carga explosiva',
    ingredients: [
      { name: 'Materiales químicos', material: 'reactivo', qty: 1 },
      { name: 'Chatarra', material: 'metal', qty: 1 },
    ],
    result: { name: 'Explosivo casero', qty: 1 },
    category: 'explosivo', skillReq: { skill: 'Electricidad', level: 3 }, minutes: 50, xp: 9,
    desc: 'Artefacto inestable. Un error de montaje es un error definitivo.',
  }),

  // ── Herramientas ─────────────────────────────────────────────────────────
  R({
    id: 'Antorcha',
    ingredients: [
      { name: 'Madera', material: 'madera', qty: 1 },
      { name: 'Tela', material: 'tela', qty: 1 },
    ],
    result: { name: 'Mechero', qty: 1 },
    category: 'herramienta', skillReq: null, minutes: 10, xp: 2,
    desc: 'Luz y calor inmediatos. Se consume rápido, pero no necesita pilas.',
  }),
  R({
    id: 'Mochila improvisada',
    ingredients: [
      { name: 'Tela', material: 'tela', qty: 2 },
      { name: 'Cuerda (5m)', material: 'atadura', qty: 1 },
    ],
    result: { name: 'Bolsa de lona', qty: 1 },
    category: 'herramienta', skillReq: { skill: 'Sastrería', level: 1 }, minutes: 35, xp: 5,
    desc: 'Un bulto cosido a mano. +10 kg y +15 L de capacidad.',
  }),
  R({
    id: 'Destilador de agua',
    ingredients: [
      { name: 'Chatarra', material: 'metal', qty: 2 },
      { name: 'Mechero', material: 'ignicion', qty: 1 },
    ],
    result: { name: 'Agua (500ml)', qty: 3 },
    category: 'herramienta', skillReq: { skill: 'Mecánica', level: 2 }, minutes: 90, xp: 7,
    desc: 'Hervir, condensar, recoger. Lento pero convierte cualquier agua en potable.',
  }),
  R({
    id: 'Caña de pescar improvisada',
    ingredients: [
      { name: 'Madera', material: 'madera', qty: 1 },
      { name: 'Cuerda (5m)', material: 'atadura', qty: 1 },
    ],
    result: { name: 'Caña de pescar', qty: 1 },
    category: 'herramienta', skillReq: { skill: 'Pesca', level: 1 }, minutes: 25, xp: 4,
    desc: 'Vara larga, sedal y anzuelo doblado a mano.',
  }),
  R({
    id: 'Kit de reparación',
    ingredients: [
      { name: 'Chatarra', material: 'metal', qty: 2 },
      { name: 'Herramientas básicas', material: 'herramienta', qty: 1 },
    ],
    result: { name: 'Kit de reparación', qty: 1 },
    category: 'herramienta', skillReq: { skill: 'Mecánica', level: 3 }, minutes: 60, xp: 8,
    desc: 'Piezas, alambre y parches. La base de cualquier construcción seria.',
  }),

  // ── Comida ───────────────────────────────────────────────────────────────
  R({
    id: 'Ración de campo',
    ingredients: [{ name: 'Lata de comida', qty: 2 }],
    result: { name: 'Comida enlatada x3', qty: 1 },
    category: 'comida', skillReq: { skill: 'Cocina', level: 2 }, minutes: 45, xp: 5,
    desc: 'Dos latas se convierten en tres raciones bien selladas. Rendimiento puro.',
  }),
  R({
    id: 'Caldo medicinal',
    ingredients: [
      { name: 'Agua (500ml)', qty: 1 },
      { name: 'Semillas variadas', qty: 1 },
    ],
    result: { name: 'Barrita energética', qty: 2 },
    category: 'comida', skillReq: { skill: 'Cocina', level: 3 }, minutes: 40, xp: 6,
    desc: 'Nutritivo y reconfortante. Levanta a cualquiera.',
  }),
  R({
    id: 'Carne curada',
    ingredients: [
      { name: 'Lata de comida', qty: 1 },
      { name: 'Mechero', material: 'ignicion', qty: 1 },
    ],
    result: { name: 'Carne curada', qty: 2 },
    category: 'comida', skillReq: { skill: 'Cocina', level: 1 }, minutes: 120, xp: 4,
    desc: 'Ahumada despacio. Aguanta semanas sin estropearse.',
  }),

  R({
    id: 'Remendar ropa',
    ingredients: [
      { name: 'Aguja e hilo', material: 'costura', qty: 1 },
      { name: 'Tela', material: 'tela', qty: 1 },
    ],
    result: { name: 'Ropa de abrigo', qty: 1 },
    category: 'herramienta', skillReq: { skill: 'Sastrería', level: 2 }, minutes: 50, xp: 5,
    desc: 'Con paciencia y retales sale algo que abriga de verdad.',
  }),

  // ── Base ─────────────────────────────────────────────────────────────────
  R({
    id: 'Barricada de madera',
    ingredients: [
      { name: 'Madera', material: 'madera', qty: 2 },
      { name: 'Herramientas básicas', material: 'herramienta', qty: 1 },
    ],
    result: { name: 'Madera', qty: 3 },
    category: 'base', skillReq: { skill: 'Carpintería', level: 2 }, minutes: 60, xp: 6,
    desc: 'Tablones cortados a medida, listos para levantar estructuras.',
  }),
  R({
    id: 'Recuperar chatarra',
    ingredients: [{ name: 'Kit de reparación', qty: 1 }],
    result: { name: 'Chatarra', qty: 3 },
    category: 'base', skillReq: null, minutes: 20, xp: 2,
    desc: 'Desmontar es más fácil que montar. Devuelve materia prima.',
  }),
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export const RECIPE_CATEGORIES: Record<RecipeCategory, { label: string; icon: string; hue: number }> = {
  medico:      { label: 'Médico',       icon: '🩺', hue: 150 },
  arma:        { label: 'Armas',        icon: '🗡️', hue: 25 },
  herramienta: { label: 'Herramientas', icon: '🔧', hue: 60 },
  comida:      { label: 'Comida',       icon: '🍖', hue: 90 },
  base:        { label: 'Refugio',      icon: '🏚️', hue: 285 },
  explosivo:   { label: 'Explosivos',   icon: '💣', hue: 10 },
};

/** Libros que enseñan recetas al obtenerlos. */
export const BOOK_RECIPES: Record<string, string[]> = {
  'Manual de medicina': ['Vendas improvisadas', 'Botiquín improvisado', 'Suero de rehidratación', 'Analgésico casero'],
  'Manual de ingeniería': ['Kit de reparación', 'Destilador de agua', 'Barricada de madera', 'Carga explosiva'],
};
