import { GENRES, skinItem } from '../data/genres';
import { archetypeName } from '../data/archetypes';
import { NARRATORS, WEATHER, DISEASES, STRUCTURES } from '../data/conditions';
import { RECIPE_BY_ID, RECIPES, ingredientLabel } from '../data/recipes';
import { ITEM_NAMES, MATERIAL_CLASSES, getItem } from '../data/items';
import { capacityOf, effectiveLevel } from '../engine/rules';
import { SEVERITY_LABEL, INJURY_ZONES, xpToLevel } from '../data/skills';
import { clockOf, dayOf, partOfDay } from '../engine/rules';
import { currentNode } from '../engine/world';
import { traitLabels } from '../data/traits';
import type { GameState } from '../engine/types';

const list = (items: string[], empty = 'ninguno') => (items.length ? items.join(', ') : empty);

/** Traduce un 0-100 a algo que el narrador pueda usar sin inventarse el tono. */
function describeNeed(valor: number, escala: [number, string][]): string {
  for (const [umbral, texto] of escala) if (valor <= umbral) return texto;
  return escala[escala.length - 1][1];
}

const HAMBRE: [number, string][] = [
  [0, 'lleva días sin comer de verdad: el cuerpo se está consumiendo'],
  [15, 'hambre que duele, cuesta pensar en otra cosa'],
  [35, 'hambre clara, el estómago protesta'],
  [60, 'podría comer algo'],
  [100, 'bien comido'],
];
const SED: [number, string][] = [
  [0, 'deshidratación grave: visión borrosa y la boca pastosa'],
  [15, 'sed que empieza a nublarle el juicio'],
  [35, 'sed molesta, la garganta seca'],
  [60, 'no le vendría mal beber'],
  [100, 'bien hidratado'],
];
const SUENO: [number, string][] = [
  [0, 'lleva demasiado despierto: se le cierran los ojos de pie'],
  [15, 'agotamiento peligroso, reflejos torpes'],
  [35, 'cansancio notable'],
  [60, 'algo cansado'],
  [100, 'descansado'],
];

/** Resumen compacto del estado: es lo único que ve el modelo de la ficha. */
/**
 * Tres recetas candidatas elegidas por afinidad con lo que lleva encima, en vez
 * de listar las dieciséis pendientes en cada petición.
 */
function candidatas(state: GameState): string[] {
  const tiene = new Set(state.inventory.map((i) => i.name));
  return RECIPES
    .filter((r) => !state.knownRecipes.includes(r.id))
    .map((r) => ({
      id: r.id,
      afinidad: r.ingredients.filter((i) => i.name && tiene.has(i.name)).length,
    }))
    .sort((a, b) => b.afinidad - a.afinidad)
    .slice(0, 3)
    .map((r) => r.id);
}

export function buildStateBrief(state: GameState): string {
  const genre = GENRES[state.genre ?? 'apocalypse'];
  const node = currentNode(state.map);
  const carga = capacityOf(
    state.inventory, effectiveLevel(state, 'Fuerza'),
    state.base.established && state.base.structures.includes('almacen') && state.map.currentZone === state.base.location,
    state.customItems,
  );
  const skills = Object.entries(state.skillXp)
    .map(([k, v]) => [k, xpToLevel(v)] as const)
    .filter(([, lvl]) => lvl > 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, lvl]) => `${k} ${lvl}`);

  // Antes se cortaba por los 18 primeros por orden de creación: tras 50 turnos
  // el modelo solo veía las más antiguas y ninguna de las de al lado.
  const aqui = state.map.currentZone;
  const vecinas = new Set(state.map.nodes[aqui]?.connections ?? []);
  const relevantes = Object.entries(state.map.nodes)
    .map(([name, n]) => ({
      name, n,
      prioridad: name === aqui ? 0 : vecinas.has(name) ? 1 : n.isBase ? 2 : n.visited ? 3 : 4,
      dia: n.discoveredDay ?? 0,
    }))
    .sort((a, b) => a.prioridad - b.prioridad || b.dia - a.dia)
    .slice(0, 14);
  const zones = relevantes.map(({ name, n }) =>
    `${name}(${n.visited ? n.type : 'sin explorar'}, peligro ${n.danger}${n.isBase ? ', REFUGIO' : ''}${vecinas.has(name) ? ', vecina' : ''})`);

  const inv = state.inventory.map((s) => {
    const def = getItem(s.name, state.customItems);
    const mats = def.materials ? ` [sirve como ${Object.keys(def.materials).join('/')}]` : '';
    return `${skinItem(s.name, state.genre)}${s.qty > 1 ? ` ×${s.qty}` : ''}${mats}`;
  });

  const injuries = state.injuries.map(
    (i) => `${INJURY_ZONES[i.zone].label} (${SEVERITY_LABEL[i.severity].toLowerCase()}): ${i.label}`,
  );
  const diseases = state.diseases.map(
    (d) => `${DISEASES[d.id].label} (${DISEASES[d.id].stages[d.stage].label.toLowerCase()})`,
  );
  const mods = state.modifiers.map((m) => m.label);

  const recipes = state.knownRecipes
    .map((id) => {
      const r = RECIPE_BY_ID[id];
      return r ? `${id} = ${r.ingredients.map((i) => `${ingredientLabel(i)}×${i.qty}`).join(' + ')} → ${r.result.name}` : null;
    })
    .filter(Boolean) as string[];

  const base = state.base.established
    ? `en ${state.base.location}. Construido: ${list(state.base.structures.map((s) => STRUCTURES[s].label))}. Almacén: ${list(state.base.storage.map((s) => `${s.name}×${s.qty}`), 'vacío')}`
    : 'sin establecer';

  return [
    `PERSONAJE: ${state.charName}, ${archetypeName(state.archetypeId, state.genre)}.`,
    `Rasgos: ${list(traitLabels(state.traits))}.`,
    `Habilidades destacadas: ${list(skills, 'todas básicas')}.`,
    `VIDA: ${Math.round(state.hp)}/${state.maxHp}${state.hp < state.maxHp * 0.35 ? ' — muy malherido' : ''}.`,
    `ESTADO DEL CUERPO: ${describeNeed(state.needs.hunger, HAMBRE)}; ${describeNeed(state.needs.thirst, SED)}; ${describeNeed(state.needs.sleep, SUENO)}.`,
    `(cifras: hambre ${Math.round(state.needs.hunger)}, sed ${Math.round(state.needs.thirst)}, sueño ${Math.round(state.needs.sleep)}, temperatura ${state.needs.temp}°C)`,
    `CARGA: ${carga.usedKg}/${carga.maxKg} kg${carga.over ? ' — VA SOBRECARGADO: se mueve lento, hace ruido y se cansa antes' : ''}.`,
    `Lesiones: ${list(injuries, 'ninguna')}.`,
    `Enfermedades: ${list(diseases, 'ninguna')}.`,
    `Estados temporales: ${list(mods, 'ninguno')}.`,
    `INVENTARIO: ${list(inv, 'vacío')}.`,
    `Recetas que conoce: ${list(recipes, 'ninguna')}.`,
    `Alguna receta que podrías enseñarle si la escena lo justifica: ${list(candidatas(state), 'ninguna')}.`,
    `MOMENTO: día ${dayOf(state.minutes)}, ${clockOf(state.minutes)} (${partOfDay(state.minutes).toLowerCase()}).`,
    `CLIMA: ${WEATHER[state.weather.id].label} — ${WEATHER[state.weather.id].desc}`,
    `ZONA ACTUAL: ${state.map.currentZone || 'Inicio'}${node ? ` (${node.type}, peligro ${node.danger}/5)` : ''}.`,
    `ZONAS CONOCIDAS: ${list(zones, 'solo la actual')}.`,
    `REFUGIO: ${base}.`,
    `AMBIENTACIÓN: ${genre.label}. ${genre.premise}`,
    `AMENAZAS HABITUALES: ${genre.threats}.`,
  ].join('\n');
}

/** Catálogo compacto. Pedir "nombre exacto" sin mandarlo era imposible de cumplir. */
const CATALOGO = ITEM_NAMES.join(' · ');

const SCHEMA = `{
  "narrative": "2-4 párrafos. Lo que ocurre al ejecutar la acción del jugador. Concreto, sensorial, con consecuencias.",
  "hpChange": 0,
  "itemsGained": [{"name": "nombre exacto del catálogo", "qty": 1}],
  "itemsLost": [{"name": "nombre exacto del catálogo", "qty": 1}],
  "skillXp": {"Rastreo": 1},
  "timeMinutes": 15,
  "hungerChange": 0,
  "thirstChange": 0,
  "sleepChange": 0,
  "tempChange": 0,
  "sceneDescription": "8-14 words IN ENGLISH describing the scene for an image generator",
  "location": "nombre corto del sitio",
  "injuriesUpdate": [{"zone": "cabeza|torso|brazo_izq|brazo_der|pierna_izq|pierna_der", "severity": 1, "label": "descripción breve", "action": "add"}],
  "diseasesUpdate": [{"id": "fever|food_poison|respiratory|radiation|wound_infection|exhaustion", "action": "add", "cause": "motivo"}],
  "mapUpdate": {"currentZone": "zona actual", "type": "urban|wilderness|indoor|underground|water", "danger": 2, "connections": ["zona vecina"]},
  "suggestions": ["tres o cuatro acciones concretas que el jugador podría intentar ahora"],
  "newItems": [{"name": "Colilla a medio fumar", "kg": 0.01, "l": 0.01, "tags": ["junk"], "materials": {"combustible": 0.4}, "desc": "Apurada hasta el filtro."}],
  "recipesLearned": ["nombre exacto de una receta del listado de las que aún no conoce"],
  "sheltered": false
}`;

/**
 * El clima severo castigaba después de narrar, sin que el modelo supiera que
 * iba a ocurrir. Si va a caer una tormenta, que la cuente él.
 */
function avisoClima(state: GameState): string[] {
  const w = WEATHER[state.weather.id];
  if (!w.severe) return [];
  return [
    ``,
    `ATENCIÓN — CLIMA SEVERO: está cayendo ${w.label.toLowerCase()}. ${w.desc}`,
    `Si el jugador NO busca resguardo, narra las consecuencias físicas en el propio relato (quemaduras, frío que cala, el viento arrancándole cosas de las manos) y pon "sheltered": false.`,
    `Si consigue ponerse a cubierto, cuéntalo y pon "sheltered": true.`,
  ];
}

export function buildSystemPrompt(state: GameState): string {
  const narrator = NARRATORS[state.narrator] ?? NARRATORS.cronista;
  return [
    `Eres el motor narrativo de un juego de supervivencia en español.`,
    ``,
    `VOZ DEL NARRADOR (${narrator.label}): ${narrator.voice}`,
    `Así suena esta voz: «${narrator.preview}»`,
    `Mantén esa voz en TODO el campo "narrative", de la primera frase a la última.`,
    ``,
    `ESTADO ACTUAL`,
    buildStateBrief(state),
    ``,
    `CATÁLOGO DE OBJETOS (usa estos nombres tal cual cuando encajen):`,
    CATALOGO,
    ``,
    `REGLAS`,
    `1. Narra SOLO la consecuencia de la acción que pide el jugador. No decidas por él ni saltes al siguiente objetivo.`,
    `2. El mundo es coherente y hostil, pero justo: si la acción es sensata y la habilidad es alta, suele salir bien.`,
    `3. Sé concreto. Nada de "encuentras algo útil": di qué, dónde y en qué estado.`,
    `4. OBJETOS NUEVOS: el mundo no está limitado a un catálogo cerrado. Si el jugador busca algo concreto y es plausible que esté ahí (una colilla, una chapa de botella, unas gafas rotas, un cuaderno ajeno, un rollo de cinta), decláralo en "newItems" con su peso y volumen REALISTAS y añádelo también a "itemsGained". Una colilla pesa 0.01 kg, no 0.3. Un motor pesa 30 kg.`,
    `   - "tags" válidas: weapon, ammo, medical, cure, food, water, tool, light, fire, nav, clock, craft, book, container, clothing, warm, electronic, junk.`,
    `   - "materials" dice para qué sirve el objeto al fabricar. Clases: ${Object.entries(MATERIAL_CLASSES).map(([k, v]) => `${k} (${v.desc})`).join(', ')}. El número es la penalización: 0 = ideal, 0.3 = sirve a duras penas. Una cinta adhesiva es {"adhesivo": 0}; una camisa vieja es {"tela": 0.1}.`,
    `   - Si el objeto ya existe en el inventario o es un sinónimo de algo que existe, NO lo declares como nuevo: úsalo tal cual.`,
    `   - No inventes objetos como premio gratuito. Solo aparecen si la acción y el sitio lo justifican.`,
    `5. RECETAS: si la escena enseña a fabricar algo (unas notas en una pared, alguien que lo explica, un manual medio quemado), ponlo en "recipesLearned" con el nombre exacto de una receta del listado de pendientes.`,
    `6. No quites objetos que el jugador no lleve. No le cures ni le hieras sin motivo narrado.`,
    `7. timeMinutes realista: 3 beber, 10 comer, 15 registrar una habitación, 60 explorar un edificio, 120 caminar a otra zona, 300 descansar, 480 dormir la noche.`,
    `8. mapUpdate es OBLIGATORIO en cada respuesta. Si el jugador no se mueve, repite la zona actual. Añade como mucho DOS conexiones, y solo sitios que se vean o se intuyan desde aquí.`,
    `   Si la zona actual se llama "Inicio", es un marcador: bautízala con un nombre propio del sitio donde empieza la historia.`,
    `9. injuriesUpdate y diseasesUpdate SOLO cuando algo lo justifique en la narración.`,
    `10. Las necesidades las gestiona el motor: usa hungerChange/thirstChange/sleepChange únicamente para lo que el jugador coma, beba o duerma explícitamente (valores positivos).`,
    `11. "suggestions": 3 o 4 acciones breves, específicas de esta escena, escritas en primera persona ("Registro los armarios de la cocina").`,
    `12. "sheltered": true si al terminar la acción el personaje queda resguardado del tiempo (dentro de un edificio, bajo tierra, bajo un puente), false si sigue a la intemperie. El motor lo usa para decidir si le cae encima el clima, así que tiene que coincidir con lo que narres.`,
    ...avisoClima(state),
    ``,
    `FORMATO: responde ÚNICAMENTE con este objeto JSON, sin markdown, sin texto antes ni después:`,
    SCHEMA,
  ].join('\n');
}

export function buildOpeningMessage(state: GameState): string {
  const genre = GENRES[state.genre ?? 'apocalypse'];
  return [
    `Comienza la partida. Soy ${state.charName}, ${archetypeName(state.archetypeId, state.genre).toLowerCase()}.`,
    `Rasgos: ${list(traitLabels(state.traits))}.`,
    `Llevo encima: ${list(state.inventory.map((i) => skinItem(i.name, state.genre)))}.`,
    ``,
    `Preséntame el mundo y mi situación inmediata: dónde estoy, qué veo, qué me está apretando ahora mismo.`,
    `Termina con una decisión concreta sobre la mesa. Ambientación: ${genre.label.toLowerCase()}.`,
  ].join('\n');
}

/**
 * Fabricación sin receta. El modelo juzga si la idea es plausible y con qué
 * material se hace; el motor decide si sale bien y aplica el resultado.
 */
export function buildImprovisePrompt(state: GameState, goal: string): string {
  const inv = state.inventory.map((s) => {
    const def = getItem(s.name, state.customItems);
    const mats = def.materials ? ` (sirve como ${Object.keys(def.materials).join('/')})` : '';
    return `${s.name} ×${s.qty} — ${def.kg} kg${mats}`;
  });
  const skills = Object.entries(state.skillXp)
    .map(([k, v]) => `${k} ${xpToLevel(v)}`)
    .join(', ');

  return [
    `Eres el árbitro de fabricación de un juego de supervivencia. El jugador quiere improvisar algo SIN receta.`,
    ``,
    `LO QUE LLEVA ENCIMA:`,
    list(inv, 'nada'),
    ``,
    `SUS HABILIDADES: ${skills}`,
    `DÓNDE ESTÁ: ${state.location}. Día ${dayOf(state.minutes)}, ${clockOf(state.minutes)}.`,
    ``,
    `LO QUE QUIERE HACER: "${goal}"`,
    ``,
    `Juzga con criterio de mundo real, no de catálogo:`,
    `- Si con lo que lleva se puede hacer algo razonable, di que sí aunque no exista ninguna receta.`,
    `  Arrancarle las mangas a una camisa para hacer una camiseta y unas vendas: SÍ.`,
    `  Atar un cuchillo a un palo con cinta para hacer una lanza: SÍ.`,
    `  Fabricar una radio de cero sin electrónica: NO.`,
    `- "consumes" son objetos EXACTOS de la lista de arriba. No consumas lo que no lleva.`,
    `- Una herramienta que solo se usa (un cuchillo para cortar) NO se consume; un material que se transforma, SÍ.`,
    `- "produces" es el resultado. Si el objeto resultante no existe todavía, decláralo también en "newItems" con peso y volumen realistas.`,
    `- "difficulty": 0.05 si es trivial (rasgar tela), 0.3 normal, 0.6 delicado, 0.85 casi imposible.`,
    `- "skill": la habilidad relevante, o null. Opciones: Sastrería, Carpintería, Mecánica, Herrería, Electricidad, Albañilería, Cocina, Primeros auxilios, Trampas, Pesca.`,
    `- "narrative": 1-2 frases describiendo el intento, en segunda persona. No digas si sale bien o mal: de eso se encarga el juego.`,
    ``,
    `Responde SOLO con este JSON:`,
    `{`,
    `  "feasible": true,`,
    `  "reason": "si feasible es false, explica en una frase por qué no",`,
    `  "consumes": [{"name": "nombre exacto", "qty": 1}],`,
    `  "produces": [{"name": "resultado", "qty": 1}],`,
    `  "newItems": [{"name": "resultado", "kg": 0.3, "l": 0.5, "tags": ["clothing"], "materials": {"tela": 0.1}, "desc": "descripción breve"}],`,
    `  "minutes": 20,`,
    `  "difficulty": 0.3,`,
    `  "skill": "Sastrería",`,
    `  "narrative": "Lo que haces con las manos."`,
    `}`,
  ].join('\n');
}

export function buildStylePrompt(state: GameState): string {
  const narrator = NARRATORS[state.narrator] ?? NARRATORS.cronista;
  return [
    `Reescribe el texto que te doy aplicando estrictamente esta voz:`,
    narrator.voice,
    ``,
    `El personaje se llama ${state.charName}. Día ${dayOf(state.minutes)} de supervivencia.`,
    `REGLAS: conserva TODOS los hechos, objetos, nombres y cifras del original.`,
    `No añadas ni elimines acontecimientos. Cambia solo el estilo y el ritmo.`,
    `Responde únicamente con el texto reescrito.`,
  ].join('\n');
}

export function buildCaptionPrompt(state: GameState, sceneDesc: string): string {
  return [
    `Eres ${state.charName}. Acabas de hacer una foto en ${state.location}, día ${dayOf(state.minutes)}.`,
    `Escena: ${sceneDesc || 'un lugar cualquiera de este mundo'}.`,
    `Escribe UNA frase de máximo 18 palabras, en primera persona, como pie de foto: íntima, concreta, sin grandilocuencia.`,
    `Solo la frase, sin comillas.`,
  ].join('\n');
}

export function buildDiaryPrompt(state: GameState, recent: string): string {
  const diseases = state.diseases.map((d) => DISEASES[d.id].label);
  const injuries = state.injuries.map((i) => i.label);
  return [
    `Eres ${state.charName}, escribiendo en tu diario antes de dormir. Día ${dayOf(state.minutes)}, en ${state.location}.`,
    `Vida: ${Math.round(state.hp)}/${state.maxHp}. Hambre ${Math.round(state.needs.hunger)}, sed ${Math.round(state.needs.thirst)}.`,
    `Lesiones: ${list(injuries, 'ninguna')}. Enfermedades: ${list(diseases, 'ninguna')}.`,
    ``,
    `Lo que te ha pasado últimamente: ${recent || 'nada digno de mención'}`,
    ``,
    `Escribe 3-5 frases en PRIMERA persona, tono íntimo y cansado, sin dramatismo de más.`,
    `Responde en JSON: {"text": "la entrada", "mood": "una palabra que resuma tu ánimo"}`,
  ].join('\n');
}
