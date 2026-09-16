import { ALL_SKILLS } from '../data/skills';
import { effectiveLevel } from './rules';
import { currentNode } from './world';
import type { GameState } from './types';

/**
 * Tirada de habilidad. El motor decide si sale bien; el modelo narra el cómo.
 *
 * Hasta ahora las habilidades solo llegaban al modelo como una línea de texto y
 * era él quien decidía el resultado, así que subir de nivel no se notaba en
 * ningún sitio.
 */
export interface Roll {
  skill: string;
  level: number;
  d20: number;
  total: number;
  difficulty: number;
  outcome: 'pifia' | 'fallo' | 'justo' | 'exito' | 'critico';
  label: string;
}

/**
 * Palabras que delatan qué habilidad está en juego. Se busca la primera que
 * aparezca en la acción escrita por el jugador.
 */
const PISTAS: [string, RegExp][] = [
  ['Sigilo', /\b(sigilo|a escondidas|sin hacer ruido|me escondo|escondo|agazap|furtiv|colarme|cuelo|espi[aoí])/i],
  ['Puntería', /\b(disparo|apunto|tiro con|abro fuego|dispar|francotir)/i],
  ['Recarga', /\b(recargo|recargar)/i],
  ['Primeros auxilios', /\b(curo|curar|vendo|vendar|coso la herida|atiendo|trato la herida|suturo|desinfect)/i],
  ['Rastreo', /\b(rastre|sigo el rastro|huellas|busco pistas|exploro en busca|olfate|orient)/i],
  ['Trampas', /\b(trampa|cepo|lazo|pongo un cepo)/i],
  ['Pesca', /\b(pesco|pescar|caña|sedal|anzuelo)/i],
  ['Cultivo', /\b(planto|plantar|siembro|sembrar|cultivo|huerto|cosecho)/i],
  ['Cría de animales', /\b(animal|perro|cabra|gallina|domestic|amansar|ordeñ)/i],
  ['Cocina', /\b(cocino|cocinar|guiso|preparo comida|asar|aso |hiervo|herv)/i],
  ['Mecánica', /\b(reparo|reparar|arreglo el motor|motor|mecanismo|desmonto|engrasa)/i],
  ['Electricidad', /\b(cableado|cable|electric|corriente|fusible|batería|generador|empalmo)/i],
  ['Carpintería', /\b(tablon|tabl[oó]n|madera|clavo|serrar|asierro|carpint)/i],
  ['Albañilería', /\b(muro|pared|ladrillo|cemento|apuntal|tapio)/i],
  ['Herrería', /\b(forja|forjar|yunque|fundo metal|templar el acero)/i],
  ['Sastrería', /\b(coso|coser|remiendo|remendar|hilo|zurzo)/i],
  ['Fuerza', /\b(levanto|empujo|arrastro|fuerzo la puerta|derribo|cargo con|aparto el)/i],
  ['Hoja corta', /\b(cuchillo|navaja|puñal|apuñal)/i],
  ['Hoja larga', /\b(espada|machete|sable)/i],
  ['Hacha', /\b(hacha|hachazo)/i],
  ['Lanza', /\b(lanza|jabalina|pica)/i],
  ['Contundente', /\b(bate|garrote|maza|porra|golpeo con|puñetazo|pelea)/i],
];

export function detectSkill(action: string): string | null {
  for (const [skill, re] of PISTAS) {
    if (re.test(action)) return ALL_SKILLS.includes(skill) ? skill : null;
  }
  return null;
}

/** Dificultad base según lo hostil que sea la zona. */
export function zoneDifficulty(state: GameState): number {
  const danger = currentNode(state.map)?.danger ?? 2;
  return 8 + danger * 2;
}

const ETIQUETAS: Record<Roll['outcome'], string> = {
  pifia: 'pifia',
  fallo: 'fallo',
  justo: 'éxito justo',
  exito: 'éxito',
  critico: 'éxito rotundo',
};

/** Tira d20 + nivel contra la dificultad de la zona. */
export function rollSkill(state: GameState, skill: string, rng: () => number): Roll {
  const level = effectiveLevel(state, skill);
  const d20 = 1 + Math.floor(rng() * 20);
  const difficulty = zoneDifficulty(state);
  const total = d20 + level;

  let outcome: Roll['outcome'];
  if (d20 === 1) outcome = 'pifia';
  else if (d20 === 20) outcome = 'critico';
  else if (total >= difficulty + 6) outcome = 'critico';
  else if (total >= difficulty + 2) outcome = 'exito';
  else if (total >= difficulty) outcome = 'justo';
  else outcome = 'fallo';

  return {
    skill, level, d20, total, difficulty, outcome,
    label: `${skill} ${level} + d20(${d20}) = ${total} vs ${difficulty} → ${ETIQUETAS[outcome]}`,
  };
}

/** Instrucción para el modelo: el motor ya ha decidido, él solo narra. */
export function rollInstruction(roll: Roll): string {
  const guias: Record<Roll['outcome'], string> = {
    pifia: 'Sale MUY mal: algo se rompe, alguien te oye o te haces daño. Consecuencia clara y dolorosa.',
    fallo: 'NO lo consigue. Narra el intento fallido y qué se tuerce, sin ser cruel de más.',
    justo: 'Lo consigue por los pelos, con algún coste: ruido, tiempo perdido, un rasguño o material gastado.',
    exito: 'Lo consigue limpiamente. Describe cómo su pericia marca la diferencia.',
    critico: 'Lo consigue mejor de lo que esperaba. Añade una ventaja inesperada pero razonable.',
  };
  return [
    `TIRADA DEL MOTOR: ${roll.label}`,
    `RESULTADO OBLIGATORIO: ${guias[roll.outcome]}`,
    `No contradigas la tirada: tú narras el cómo, el resultado ya está decidido.`,
  ].join('\n');
}
