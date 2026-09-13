export interface Trait {
  id: string;
  label: string;
  /** Coste en puntos: negativo = cuesta, positivo = concede. */
  cost: number;
  type: 'pos' | 'neg';
  desc: string;
  skillBonus?: Record<string, number>;
  skillPenalty?: Record<string, number>;
}

export const TRAITS: Trait[] = [
  // ── Positivos ────────────────────────────────────────────────────────────
  { id: 'atletico',  label: 'Atlético',       cost: -6, type: 'pos', desc: '+1 Fuerza y más capacidad de carga.', skillBonus: { 'Fuerza': 1 } },
  { id: 'robusto',   label: 'Robusto',        cost: -6, type: 'pos', desc: '+20 de vida máxima.' },
  { id: 'agudeza',   label: 'Vista de águila', cost: -2, type: 'pos', desc: '+1 Puntería.', skillBonus: { 'Puntería': 1 } },
  { id: 'manitas',   label: 'Manitas',        cost: -4, type: 'pos', desc: '+1 Mecánica y +1 Electricidad.', skillBonus: { 'Mecánica': 1, 'Electricidad': 1 } },
  { id: 'botanico',  label: 'Botánico',       cost: -2, type: 'pos', desc: '+1 Cultivo.', skillBonus: { 'Cultivo': 1 } },
  { id: 'sigiloso',  label: 'Sigiloso',       cost: -4, type: 'pos', desc: '+2 Sigilo.', skillBonus: { 'Sigilo': 2 } },
  { id: 'medico_nato', label: 'Médico nato',  cost: -4, type: 'pos', desc: '+2 Primeros auxilios.', skillBonus: { 'Primeros auxilios': 2 } },
  { id: 'valiente',  label: 'Valiente',       cost: -4, type: 'pos', desc: 'El narrador te describe sereno bajo presión: menos penalizaciones en combate.' },
  { id: 'metabolismo_lento', label: 'Metabolismo lento', cost: -4, type: 'pos', desc: 'Hambre y sed bajan un 30 % más despacio.' },
  { id: 'inmunidad_natural', label: 'Inmunidad natural', cost: -5, type: 'pos', desc: 'Mitad de probabilidad de contraer enfermedades.' },
  { id: 'nocturno',  label: 'Nocturno',       cost: -3, type: 'pos', desc: '+1 Sigilo y +1 Rastreo; de noche rindes mejor.', skillBonus: { 'Sigilo': 1, 'Rastreo': 1 } },
  { id: 'memoria_fotografica', label: 'Memoria fotográfica', cost: -3, type: 'pos', desc: '+1 Rastreo. El mapa registra más conexiones por zona.', skillBonus: { 'Rastreo': 1 } },
  { id: 'sangre_fria', label: 'Sangre fría',  cost: -4, type: 'pos', desc: '+1 Puntería y +1 Sigilo. Inmune al pánico.', skillBonus: { 'Puntería': 1, 'Sigilo': 1 } },
  { id: 'cicatrizacion', label: 'Cicatrización rápida', cost: -5, type: 'pos', desc: 'Las lesiones se curan solas al doble de velocidad.' },

  // ── Negativos ────────────────────────────────────────────────────────────
  { id: 'debil',     label: 'Débil',          cost: 6, type: 'neg', desc: '−20 de vida máxima.' },
  { id: 'cobarde',   label: 'Cobarde',        cost: 4, type: 'neg', desc: 'El pánico te domina en combate.' },
  { id: 'lento',     label: 'Lento',          cost: 4, type: 'neg', desc: '−1 Sigilo y −1 Rastreo.', skillPenalty: { 'Sigilo': -1, 'Rastreo': -1 } },
  { id: 'miope',     label: 'Miope',          cost: 2, type: 'neg', desc: '−1 Puntería y −1 Rastreo.', skillPenalty: { 'Puntería': -1, 'Rastreo': -1 } },
  { id: 'torpe',     label: 'Torpe',          cost: 2, type: 'neg', desc: '−1 Mecánica y −1 Carpintería.', skillPenalty: { 'Mecánica': -1, 'Carpintería': -1 } },
  { id: 'gloton',    label: 'Glotón',         cost: 4, type: 'neg', desc: 'El hambre sube un 50 % más rápido.' },
  { id: 'ruidoso',   label: 'Ruidoso',        cost: 4, type: 'neg', desc: '−2 Sigilo.', skillPenalty: { 'Sigilo': -2 } },
  { id: 'despistado', label: 'Despistado',    cost: 2, type: 'neg', desc: '−1 Rastreo y −1 Trampas.', skillPenalty: { 'Rastreo': -1, 'Trampas': -1 } },
  { id: 'adicto',    label: 'Adicto',         cost: 4, type: 'neg', desc: 'Cada 5 acciones necesitas Morfina o Alcohol, o sufres abstinencia.' },
  { id: 'claustrofobico', label: 'Claustrofóbico', cost: 3, type: 'neg', desc: 'En interiores y subterráneos te agotas mucho más rápido.', skillPenalty: { 'Sigilo': -1 } },
  { id: 'herido_previo', label: 'Herido previo', cost: 4, type: 'neg', desc: 'Empiezas con una lesión leve en una zona aleatoria.' },
  { id: 'sediento',  label: 'Sediento',       cost: 3, type: 'neg', desc: 'La sed sube el doble de rápido.' },
  { id: 'paranoico', label: 'Paranoico',      cost: 2, type: 'neg', desc: 'Cada 5 acciones sufres un episodio de paranoia.' },
  { id: 'friolero',  label: 'Friolero',       cost: 3, type: 'neg', desc: 'El frío te afecta el doble. La ropa de abrigo es imprescindible.' },
];

export const TRAIT_BY_ID = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export const MAX_TRAITS = 6;

export function traitLabels(ids: string[]): string[] {
  return ids.map((id) => TRAIT_BY_ID[id]?.label).filter(Boolean) as string[];
}

/** Suma de costes. Debe quedar ≥ 0 para que la ficha sea válida. */
export function traitBalance(ids: string[]): number {
  return ids.reduce((s, id) => s + (TRAIT_BY_ID[id]?.cost ?? 0), 0);
}
