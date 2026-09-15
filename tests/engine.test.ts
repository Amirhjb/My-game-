/* Pruebas del motor: se ejecutan con `npm test`. Sin dependencias externas. */
import { reducer } from '../src/engine/reducer';
import { initialState } from '../src/engine/state';
import { parseTurn, parseImprovise, matchItemName, extractJson, asNewItems } from '../src/ai/schema';
import { estimateItem, getItem, itemsForMaterial } from '../src/data/items';
import { planCraft, resolveCraft } from '../src/engine/crafting';
import { tickNeeds, capacityOf, addItems, removeItems } from '../src/engine/rules';
import { advanceWeather, applyMapUpdate, relaxLayout, rollWeather } from '../src/engine/world';
import type { GameState, TurnResult } from '../src/engine/types';

let pass = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, extra = '') {
  if (cond) pass++;
  else fails.push(`${name}${extra ? ` — ${extra}` : ''}`);
}

/** Generador determinista para que las pruebas no dependan del azar. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const turn = (over: Partial<TurnResult> = {}): TurnResult => ({
  narrative: 'Algo ocurre.', hpChange: 0, itemsGained: [], itemsLost: [], skillXp: {},
  timeMinutes: 30, hungerChange: 0, thirstChange: 0, sleepChange: 0, tempChange: 0,
  sceneDescription: '', location: 'Inicio',
  injuriesUpdate: [], diseasesUpdate: [],
  mapUpdate: { currentZone: 'Inicio', type: 'urban', danger: 2, connections: [] },
  suggestions: [], newItems: [], recipesLearned: [], ...over,
});

const countOfName = (s: GameState, name: string) => s.inventory.find((i) => i.name === name)?.qty ?? 0;

function newRun(): GameState {
  let s = initialState;
  s = reducer(s, { type: 'setGenre', genre: 'apocalypse' });
  s = reducer(s, { type: 'setName', name: 'Tester' });
  s = reducer(s, { type: 'setArchetype', id: 'engineer' });
  s = reducer(s, { type: 'toggleTrait', id: 'robusto', max: 6 });
  s = reducer(s, { type: 'toggleTrait', id: 'debil', max: 6 });
  return reducer(s, { type: 'startRun', rng: seeded(7) });
}

// ── Creación de partida ──────────────────────────────────────────────────────
{
  const s = newRun();
  check('startRun entra en la pantalla de juego', s.screen === 'game');
  check('startRun da el equipo del arquetipo', s.inventory.length === 9, `${s.inventory.length}`);
  check('robusto y débil se cancelan', s.maxHp === 100, `${s.maxHp}`);
  check('la vida empieza al máximo', s.hp === s.maxHp);
  check('mapa con la zona inicial', s.map.currentZone === 'Inicio' && !!s.map.nodes['Inicio']);
  check('el manual de ingeniería enseña recetas', s.knownRecipes.includes('Carga explosiva'));
  check('Mecánica empieza por encima de 1', (s.skillXp['Mecánica'] ?? 0) > 0);
}

// ── Turno: objetos, tiempo, mapa ─────────────────────────────────────────────
{
  let s = newRun();
  const before = s.minutes;
  s = reducer(s, {
    type: 'applyTurn', rng: seeded(3), playerText: 'Busco chatarra',
    result: turn({
      itemsGained: [{ name: 'Chatarra', qty: 3 }],
      itemsLost: [{ name: 'Cuchillo', qty: 1 }],
      timeMinutes: 60, skillXp: { 'Rastreo': 3 },
      mapUpdate: { currentZone: 'Nave 4', type: 'indoor', danger: 3, connections: ['Patio trasero'] },
    }),
  });
  check('el tiempo avanza', s.minutes === before + 60, `${s.minutes - before}`);
  check('se añaden objetos', s.inventory.find((i) => i.name === 'Chatarra')?.qty === 3);
  check('se retiran objetos', !s.inventory.find((i) => i.name === 'Cuchillo'));
  check('cambia la zona actual', s.map.currentZone === 'Nave 4');
  check('la zona vecina queda en el mapa', !!s.map.nodes['Patio trasero'] && !s.map.nodes['Patio trasero'].visited);
  check('las zonas quedan conectadas', s.map.nodes['Nave 4'].connections.includes('Inicio'));
  // Solo cuenta lo que se ha pisado: las vecinas aún sin visitar no suman.
  check('se cuentan solo las zonas visitadas', s.stats.zonesDiscovered === 2, `${s.stats.zonesDiscovered}`);
  check('se concede experiencia', (s.skillXp['Rastreo'] ?? 0) > 0);
  check('se cuenta la acción', s.stats.actions === 1);
}

// ── No se puede perder lo que no se lleva ────────────────────────────────────
{
  let s = newRun();
  const n = s.inventory.length;
  s = reducer(s, { type: 'applyTurn', rng: seeded(1), playerText: null, result: turn({ itemsLost: [{ name: 'Rifle', qty: 1 }] }) });
  check('no se pierden objetos inexistentes', s.inventory.length === n);
}

// ── Lesiones y enfermedades ─────────────────────────────────────────────────
{
  let s = newRun();
  s = reducer(s, {
    type: 'applyTurn', rng: seeded(11), playerText: null,
    result: turn({
      injuriesUpdate: [{ zone: 'pierna_izq', severity: 2, label: 'Torcedura fea', action: 'add' }],
      diseasesUpdate: [{ id: 'fever', action: 'add' }],
    }),
  });
  check('se registra la lesión', s.injuries.length === 1 && s.injuries[0].severity === 2);
  check('se registra la enfermedad', s.diseases.some((d) => d.id === 'fever'));

  // La lesión penaliza la habilidad correspondiente.
  const { skillView } = await import('../src/engine/rules');
  check('la lesión penaliza Sigilo', skillView(s)['Sigilo'].penalty >= 2, `${skillView(s)['Sigilo'].penalty}`);

  // Curar con un objeto.
  let cured = reducer(s, { type: 'applyTurn', rng: seeded(2), playerText: null, result: turn({ itemsGained: [{ name: 'Antibióticos', qty: 1 }] }) });
  cured = reducer(cured, { type: 'useItem', name: 'Antibióticos' });
  check('los antibióticos curan la fiebre', !cured.diseases.some((d) => d.id === 'fever'));
}

// ── Muerte ───────────────────────────────────────────────────────────────────
{
  let s = newRun();
  s = reducer(s, { type: 'applyTurn', rng: seeded(5), playerText: null, result: turn({ hpChange: -60 }) });
  s = reducer(s, { type: 'applyTurn', rng: seeded(5), playerText: null, result: turn({ hpChange: -60 }) });
  check('la vida no baja de cero', s.hp === 0, `${s.hp}`);
  check('se activa la pantalla de muerte', s.screen === 'death', s.screen);
  check('se registra la causa', !!s.deathCause, String(s.deathCause));
}

// ── Necesidades ──────────────────────────────────────────────────────────────
{
  const base = { hunger: 80, thirst: 80, sleep: 80, temp: 36.5 };
  const t = tickNeeds(base, 480, [], []);
  check('el sueño baja al pasar 8 horas', t.needs.sleep < 80 && t.needs.sleep > 40, `${t.needs.sleep}`);
  check('la sed baja más rápido que el hambre', t.needs.thirst < t.needs.hunger);

  const dry = tickNeeds({ ...base, thirst: 0 }, 120, [], []);
  check('sin agua se pierde vida', dry.hpDelta < 0, `${dry.hpDelta}`);
  check('se avisa de la deshidratación', dry.warnings.some((w) => /deshidrat/i.test(w)));

  const slow = tickNeeds(base, 480, ['metabolismo_lento'], []);
  check('metabolismo lento reduce el consumo', slow.needs.hunger > t.needs.hunger);

  const thirsty = tickNeeds(base, 480, ['sediento'], []);
  check('sediento dobla el consumo de agua', thirsty.needs.thirst < t.needs.thirst);

  const hot = tickNeeds({ ...base, temp: 41 }, 60, [], []);
  check('la hipertermia hace daño', hot.hpDelta < 0);
  const cold = tickNeeds({ ...base, temp: 32 }, 60, [], []);
  check('la hipotermia hace daño', cold.hpDelta < 0);
}

// ── Consumibles ──────────────────────────────────────────────────────────────
{
  let s = newRun();
  const before = s.needs.thirst;
  s = reducer(s, { type: 'useItem', name: 'Agua (500ml)' });
  check('beber quita sed', s.needs.thirst > before, `${before} → ${s.needs.thirst}`);
  check('el agua se gasta', !s.inventory.find((i) => i.name === 'Agua (500ml)'));
  const s2 = reducer(s, { type: 'useItem', name: 'Agua (500ml)' });
  check('no se puede usar lo que no se tiene', s2 === s);
}

// ── Fabricación ──────────────────────────────────────────────────────────────
{
  let s = newRun();
  s = reducer(s, { type: 'applyTurn', rng: seeded(9), playerText: null, result: turn({ itemsGained: [{ name: 'Chatarra', qty: 2 }] }) });
  const plan = planCraft('Kit de reparación', s.inventory, () => 5, false);
  check('el plan se resuelve', !!plan && plan.canCraft, plan ? plan.blockers.join(';') : 'sin plan');

  const out = resolveCraft(plan!, () => 0.99); // sin fallo
  check('fabricar produce el resultado', out.ok && out.produced[0].name === 'Kit de reparación');

  const kitsBefore = s.inventory.find((i) => i.name === 'Kit de reparación')?.qty ?? 0;
  const scrapBefore = s.inventory.find((i) => i.name === 'Chatarra')?.qty ?? 0;
  const after = reducer(s, { type: 'craft', recipeId: 'Kit de reparación', rng: () => 0.99 });
  check('la fabricación consume la chatarra',
    (after.inventory.find((i) => i.name === 'Chatarra')?.qty ?? 0) === scrapBefore - 2,
    `${scrapBefore} → ${after.inventory.find((i) => i.name === 'Chatarra')?.qty}`);
  check('la fabricación entrega el objeto',
    (after.inventory.find((i) => i.name === 'Kit de reparación')?.qty ?? 0) === kitsBefore + 1);
  check('la fabricación consume tiempo', after.minutes > s.minutes);
  check('la fabricación da experiencia', (after.skillXp['Mecánica'] ?? 0) > (s.skillXp['Mecánica'] ?? 0));
  check('se cuenta lo fabricado', after.stats.itemsCrafted === 1);

  // Sin materiales: no cambia el inventario, solo avisa.
  const broke = reducer(newRun(), { type: 'craft', recipeId: 'Kit de reparación', rng: () => 0.99 });
  check('sin materiales no se fabrica', broke.inventory.length === newRun().inventory.length);
  check('sin materiales se avisa', broke.log.some((l) => /Faltan materiales/i.test(l.text)));

  // Fallo: hace falta un plan con riesgo real, así que usamos materiales improvisados.
  const riesgo = planCraft('Lanza de madera', [{ name: 'Bate de béisbol', qty: 1 }, { name: 'Machete', qty: 1 }], () => 5, false)!;
  check('el plan improvisado tiene riesgo', riesgo.failChance > 0);
  const failed = resolveCraft(riesgo, () => 0);
  check('un fallo de fabricación no produce el objeto', !failed.ok);
  check('un fallo devuelve parte del material', failed.produced.every((p) => p.name !== 'Lanza improvisada'));
}

// ── Refugio ──────────────────────────────────────────────────────────────────
{
  let s = newRun();
  s = reducer(s, { type: 'establishBase' });
  check('el refugio se funda en zona segura', s.base.established && s.base.location === 'Inicio');
  check('el mapa marca el refugio', s.map.nodes['Inicio'].isBase === true);

  s = reducer(s, { type: 'deposit', name: 'Cuchillo', qty: 1 });
  check('depositar saca de la mochila', !s.inventory.find((i) => i.name === 'Cuchillo'));
  check('depositar mete en el almacén', !!s.base.storage.find((i) => i.name === 'Cuchillo'));
  s = reducer(s, { type: 'withdraw', name: 'Cuchillo', qty: 1 });
  check('retirar lo devuelve', !!s.inventory.find((i) => i.name === 'Cuchillo') && s.base.storage.length === 0);

  // No se puede fundar en zona peligrosa.
  let d = newRun();
  d = reducer(d, { type: 'applyTurn', rng: seeded(4), playerText: null, result: turn({ mapUpdate: { currentZone: 'Matadero', type: 'urban', danger: 5, connections: [] } }) });
  d = reducer(d, { type: 'establishBase' });
  check('no se funda en zona peligrosa', !d.base.established);
}

// ── Validación de la respuesta del modelo ────────────────────────────────────
{
  const good = parseTurn('```json\n{"narrative":"Hola","timeMinutes":45,"hpChange":-5,"mapUpdate":{"currentZone":"Zona","type":"indoor","danger":3,"connections":["A"]}}\n```', 'Inicio');
  check('se ignoran las vallas de markdown', good.result?.narrative === 'Hola');
  check('se lee el tiempo', good.result?.timeMinutes === 45);

  const noisy = parseTurn('Claro, aquí tienes:\n{"narrative":"Texto con } llave","hpChange":"-3"}\nEspero que te sirva.', 'Inicio');
  check('se extrae el JSON entre prosa', noisy.result?.narrative === 'Texto con } llave');
  check('se convierten los números en texto', noisy.result?.hpChange === -3);

  const clamped = parseTurn('{"narrative":"x","hpChange":-9999,"timeMinutes":99999,"skillXp":{"Puntería":99}}', 'Inicio');
  check('se acota el daño', clamped.result?.hpChange === -60, `${clamped.result?.hpChange}`);
  check('se acota el tiempo', clamped.result?.timeMinutes === 720);
  check('se acota la experiencia', clamped.result?.skillXp['Puntería'] === 5);

  const junk = parseTurn('esto no es json en absoluto, solo texto largo del narrador contando algo', 'Inicio');
  check('el texto suelto se recupera como narrativa', junk.result === null && !!junk.fallbackNarrative);

  check('nombres con tilde y minúsculas', matchItemName('bisturi') === 'Bisturí');
  check('nombres parciales', matchItemName('botiquin pequeno') === 'Botiquín pequeño');
  check('objetos inventados se descartan', matchItemName('espada láser de plasma zzz') === null);
  check('extractJson con anidamiento', (extractJson('{"a":{"b":1}}') as { a: { b: number } }).a.b === 1);

  const badSkill = parseTurn('{"narrative":"x","skillXp":{"Telepatía":3}}', 'Inicio');
  check('se descartan habilidades inventadas', Object.keys(badSkill.result!.skillXp).length === 0);

  const badZone = parseTurn('{"narrative":"x","injuriesUpdate":[{"zone":"ala_izquierda","severity":2,"action":"add"}]}', 'Inicio');
  check('se descartan zonas del cuerpo inventadas', badZone.result!.injuriesUpdate.length === 0);
}

// ── Clima ────────────────────────────────────────────────────────────────────
{
  const w = rollWeather('apocalypse', seeded(42));
  check('el clima se genera del género', !!w.id && w.daysLeft >= 1);

  const s = { weather: { id: 'clear' as const, daysLeft: 1 }, forecast: ['rain' as const], weatherAccum: 0 };
  const a = advanceWeather(s, 60, 'apocalypse', seeded(1));
  check('una hora no cambia el día', !a.changed && a.accum === 60);
  const b = advanceWeather(s, 1440, 'apocalypse', seeded(1));
  check('un día completo cambia el clima', b.changed);
  check('la previsión se rellena', b.forecast.length === 5);
}

// ── Capacidad de carga ───────────────────────────────────────────────────────
{
  const c1 = capacityOf([{ name: 'Cuchillo', qty: 1 }], 1, false);
  const c2 = capacityOf([{ name: 'Cuchillo', qty: 1 }, { name: 'Mochila grande', qty: 1 }], 1, false);
  check('los contenedores amplían la capacidad', c2.maxKg > c1.maxKg + 17);
  check('se suma el peso del contenedor', c2.usedKg > c1.usedKg);
  const over = capacityOf([{ name: 'Rifle', qty: 20 }], 1, false);
  check('se detecta la sobrecarga', over.over);
}

// ── Inventario puro ──────────────────────────────────────────────────────────
{
  const a = [{ name: 'Chatarra', qty: 2 }];
  const b = addItems(a, [{ name: 'Chatarra', qty: 3 }]);
  check('addItems no muta la entrada', a[0].qty === 2);
  check('addItems apila', b[0].qty === 5);
  const c = removeItems(b, [{ name: 'Chatarra', qty: 5 }]);
  check('removeItems elimina la pila vacía', c.length === 0);
}

// ── Mapa: colocación sin solapes ─────────────────────────────────────────────
{
  let map = { nodes: { Inicio: { type: 'urban' as const, danger: 1, visited: true, x: 400, y: 300, connections: [] } }, currentZone: 'Inicio' };
  const rng = seeded(99);
  for (let i = 0; i < 12; i++) {
    map = applyMapUpdate(map, { currentZone: `Zona ${i}`, type: 'urban', danger: 2, connections: [] }, 1, rng).map;
  }
  const coords = Object.values(map.nodes);
  let tooClose = 0;
  for (let i = 0; i < coords.length; i++) {
    for (let j = i + 1; j < coords.length; j++) {
      if (Math.hypot(coords[i].x - coords[j].x, coords[i].y - coords[j].y) < 40) tooClose++;
    }
  }
  check('los nodos del mapa no se amontonan', tooClose === 0, `${tooClose} pares demasiado juntos`);
}

// ── Rasgos periódicos ────────────────────────────────────────────────────────
{
  let s = initialState;
  s = reducer(s, { type: 'setGenre', genre: 'apocalypse' });
  s = reducer(s, { type: 'setName', name: 'Yonqui' });
  s = reducer(s, { type: 'setArchetype', id: 'outlaw' });
  s = reducer(s, { type: 'toggleTrait', id: 'adicto', max: 6 });
  s = reducer(s, { type: 'startRun', rng: seeded(3) });
  for (let i = 0; i < 5; i++) {
    s = reducer(s, { type: 'applyTurn', rng: seeded(50 + i), playerText: null, result: turn({ timeMinutes: 10 }) });
  }
  check('la abstinencia aparece a las 5 acciones', s.modifiers.some((m) => m.id === 'abstinencia'), JSON.stringify(s.modifiers));
  check('la abstinencia penaliza todas las habilidades', s.modifiers[0]?.skills['*'] === 2);
}

// ── Límite de rasgos ─────────────────────────────────────────────────────────
{
  let s = initialState;
  for (const id of ['atletico', 'robusto', 'agudeza', 'manitas', 'botanico', 'sigiloso', 'nocturno']) {
    s = reducer(s, { type: 'toggleTrait', id, max: 6 });
  }
  check('no se superan 6 rasgos', s.traits.length === 6, `${s.traits.length}`);
}

// ── Recorte del registro y del historial ─────────────────────────────────────
{
  let s = newRun();
  for (let i = 0; i < 40; i++) {
    s = reducer(s, { type: 'pushHistory', role: 'user', content: `msg ${i}` });
  }
  check('el historial se recorta', s.history.length <= 24, `${s.history.length}`);
  for (let i = 0; i < 300; i++) s = reducer(s, { type: 'log', kind: 'system', text: `linea ${i}` });
  check('el registro se recorta', s.log.length <= 220, `${s.log.length}`);
  check('se conservan las últimas líneas', s.log[s.log.length - 1].text === 'linea 299');
}

// ── Trazado del mapa ────────────────────────────────────────────────────────
{
  // Un recorrido largo: antes esto generaba un paseo aleatorio de 800×1300 px
  // que no cabía en la ventana y formaba cadenas en vez de un mapa.
  let map = { nodes: { Inicio: { type: 'urban' as const, danger: 1, visited: true, x: 400, y: 300, connections: [] } }, currentZone: 'Inicio' };
  const rng = seeded(4242);
  for (let i = 0; i < 24; i++) {
    map = applyMapUpdate(map, {
      currentZone: `Zona ${i}`, type: 'urban', danger: 2,
      connections: i % 4 === 0 ? [`Vecina ${i}`] : [],
    }, 1, rng).map;
  }

  const pos = Object.values(map.nodes);
  const xs = pos.map((n) => n.x), ys = pos.map((n) => n.y);
  const ancho = Math.max(...xs) - Math.min(...xs);
  const alto = Math.max(...ys) - Math.min(...ys);

  check('el mapa no se desparrama', ancho < 1700 && alto < 1700, `${Math.round(ancho)}×${Math.round(alto)}`);
  // Una ventana de mapa es apaisada: el trazado debe acercarse a esa forma.
  const proporcion = ancho / alto;
  check('el trazado tiende a apaisado', proporcion > 0.6 && proporcion < 3, `${proporcion.toFixed(2)}`);

  let solapados = 0;
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      if (Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < 45) solapados++;
    }
  }
  check('ningún par de zonas se solapa', solapados === 0, `${solapados} pares`);

  // Las zonas conectadas quedan cerca; las que no, no necesariamente.
  const conectadas: number[] = [];
  for (const [name, node] of Object.entries(map.nodes)) {
    for (const conn of node.connections) {
      const o = map.nodes[conn];
      if (o) conectadas.push(Math.hypot(node.x - o.x, node.y - o.y));
    }
  }
  const media = conectadas.reduce((a, b) => a + b, 0) / conectadas.length;
  check('las zonas conectadas quedan a distancia legible', media > 60 && media < 320, `${Math.round(media)} px`);

  // Determinismo: mismo trazado de entrada, mismo de salida.
  const a = relaxLayout(map.nodes);
  const b = relaxLayout(map.nodes);
  check('el trazado es determinista', JSON.stringify(a) === JSON.stringify(b));

  // Nodos exactamente encima: se separan igualmente.
  const encimados = relaxLayout({
    A: { type: 'urban' as const, danger: 1, visited: true, x: 300, y: 300, connections: ['B'] },
    B: { type: 'urban' as const, danger: 1, visited: true, x: 300, y: 300, connections: ['A'] },
  });
  check('dos zonas superpuestas se separan', Math.hypot(encimados.A.x - encimados.B.x, encimados.A.y - encimados.B.y) > 40);

  // No se pierde nada por el camino.
  check('el trazado conserva todas las zonas', Object.keys(a).length === Object.keys(map.nodes).length);
  check('el trazado conserva los datos de cada zona', a['Zona 0'].type === map.nodes['Zona 0'].type && a['Zona 0'].visited === map.nodes['Zona 0'].visited);
  check('el trazado conserva las conexiones', JSON.stringify(a['Zona 0'].connections) === JSON.stringify(map.nodes['Zona 0'].connections));

  // Un solo nodo no revienta.
  const solo = relaxLayout({ X: { type: 'urban' as const, danger: 1, visited: true, x: 10, y: 10, connections: [] } });
  check('un mapa de una sola zona no se toca', solo.X.x === 10 && solo.X.y === 10);
}

// ── Catálogo dinámico: el mundo puede inventar objetos ──────────────────────
{
  let s = newRun();
  s = reducer(s, {
    type: 'applyTurn', rng: seeded(21), playerText: 'Rebusco en el cenicero',
    result: turn({
      newItems: [
        { name: 'Colilla a medio fumar', kg: 0.01, l: 0.01, tags: ['junk'], materials: { combustible: 0.4 } },
        { name: 'Chapa de botella', kg: 0.005, l: 0.005, tags: ['junk'] },
      ],
      itemsGained: [{ name: 'Colilla a medio fumar', qty: 4 }, { name: 'Chapa de botella', qty: 1 }],
    }),
  });
  check('el objeto nuevo entra en el catálogo de la partida', !!s.customItems['Colilla a medio fumar']);
  check('el objeto nuevo llega al inventario', countOfName(s, 'Colilla a medio fumar') === 4);
  check('el peso del objeto nuevo se respeta', getItem('Colilla a medio fumar', s.customItems).kg === 0.01);
  check('el objeto nuevo cuenta para la carga',
    capacityOf(s.inventory, 1, false, s.customItems).usedKg > capacityOf(s.inventory.filter((i) => i.name !== 'Colilla a medio fumar'), 1, false, s.customItems).usedKg);
  check('el objeto nuevo aporta su clase de material',
    itemsForMaterial(s.inventory, 'combustible', s.customItems).some((m) => m.name === 'Colilla a medio fumar'));

  // Persiste entre turnos
  s = reducer(s, { type: 'applyTurn', rng: seeded(22), playerText: null, result: turn({ itemsGained: [{ name: 'Colilla a medio fumar', qty: 1 }] }) });
  check('el objeto nuevo sigue existiendo el turno siguiente', countOfName(s, 'Colilla a medio fumar') === 5);
}

// ── Validación de objetos nuevos ────────────────────────────────────────────
{
  const ok = asNewItems([{ name: 'gafas rotas', kg: 0.05, l: 0.08, tags: ['junk', 'inventada'], materials: { filo: 0.5, telepatia: 0.1 } }], []);
  check('el nombre del objeto nuevo se normaliza', ok[0].name === 'Gafas rotas');
  check('se filtran las etiquetas inventadas', ok[0].tags.length === 1 && ok[0].tags[0] === 'junk');
  check('se filtran las clases de material inventadas', Object.keys(ok[0].materials ?? {}).length === 1);

  const absurd = asNewItems([{ name: 'Colilla', kg: 9999, l: -3 }], []);
  check('se acota un peso absurdo', absurd[0].kg === 40, `${absurd[0].kg}`);
  check('un volumen inválido cae en la estimación', absurd[0].l === estimateItem('Colilla').l, `${absurd[0].l}`);

  const dup = asNewItems([{ name: 'Cuchillo', kg: 99 }, { name: 'cuchillo', kg: 99 }], []);
  check('no se duplica lo que ya está en el catálogo base', dup.length === 0);

  const sinNombre = asNewItems([{ kg: 1 }, { name: '   ' }, { name: '123' }], []);
  check('se descartan objetos sin nombre útil', sinNombre.length === 0);

  check('la estimación distingue tamaños', estimateItem('colilla').kg < estimateItem('tablón de madera').kg);
  check('la estimación reconoce libros', estimateItem('cuaderno manchado').tags.includes('book'));
}

// ── Recetas aprendidas desde cualquier fuente ───────────────────────────────
{
  let s = newRun();
  check('no conoce la receta de partida', !s.knownRecipes.includes('Ración de campo'));
  s = reducer(s, {
    type: 'applyTurn', rng: seeded(31), playerText: null,
    result: turn({ recipesLearned: ['Ración de campo', 'Receta Inventada Que No Existe'] }),
  });
  check('aprende la receta que el mundo le enseña', s.knownRecipes.includes('Ración de campo'));
  check('descarta recetas inventadas', !s.knownRecipes.includes('Receta Inventada Que No Existe'));
  check('lo anuncia en el registro', s.log.some((l) => /Aprendes a fabricar/.test(l.text)));

  // Y sigue funcionando por libro
  let b = newRun();
  b = reducer(b, { type: 'applyTurn', rng: seeded(32), playerText: null, result: turn({ itemsGained: [{ name: 'Manual de medicina', qty: 1 }] }) });
  check('aprende leyendo un libro', b.knownRecipes.includes('Analgésico casero'));

  const parsed = parseTurn('{"narrative":"x","recipesLearned":["racion de campo"]}', 'Inicio');
  check('el nombre de receta tolera tildes', parsed.result?.recipesLearned[0] === 'Ración de campo');
}

// ── Sustituciones por clase de material ─────────────────────────────────────
{
  // La lanza pide madera + filo. Un bate y un machete deberían valer.
  const conIdeales = planCraft('Lanza de madera', [{ name: 'Madera', qty: 1 }, { name: 'Cuchillo', qty: 1 }], () => 5, false);
  check('la receta se cumple con los materiales ideales', conIdeales!.canCraft && conIdeales!.failChance === 0);

  const improvisado = planCraft('Lanza de madera', [{ name: 'Bate de béisbol', qty: 1 }, { name: 'Machete', qty: 1 }], () => 5, false);
  check('se acepta cualquier cosa que cubra la clase de material', improvisado!.canCraft);
  check('el material improvisado añade riesgo', improvisado!.failChance > 0, `${improvisado?.failChance}`);
  check('se indica con qué se sustituye', improvisado!.resolved.some((r) => r.usedSub === 'Bate de béisbol'));

  // Cinta donde la receta pide otra cosa: el kit de reparación pide metal + herramienta.
  const conCinta = planCraft('Mochila improvisada', [{ name: 'Ropa de abrigo', qty: 2 }, { name: 'Cinta adhesiva', qty: 1 }], () => 5, false);
  check('la cinta sirve de atadura', conCinta!.canCraft, conCinta?.blockers.join(';'));

  const sinNada = planCraft('Lanza de madera', [{ name: 'Lata de comida', qty: 3 }], () => 5, false);
  check('sin material de la clase pedida no se puede', !sinNada!.canCraft);
  check('el bloqueo nombra la clase que falta', /madera|Madera/.test(sinNada!.blockers[0]), sinNada!.blockers[0]);

  // Un objeto inventado en la partida también puede cubrir una clase.
  const catalogo = { 'Trapo mugriento': { kg: 0.2, l: 0.3, tags: ['craft'], materials: { tela: 0.2 } } };
  const conInventado = planCraft('Vendas improvisadas', [{ name: 'Trapo mugriento', qty: 1 }], () => 5, false, catalogo);
  check('un objeto inventado cubre su clase de material', conInventado!.canCraft);
  check('el objeto inventado arrastra su penalización', conInventado!.failChance === 0.2, `${conInventado?.failChance}`);

  // Se listan las alternativas disponibles
  const conVarias = planCraft('Vendas improvisadas', [{ name: 'Tela', qty: 2 }, { name: 'Ropa de abrigo', qty: 1 }], () => 5, false);
  check('se ofrecen las alternativas del inventario', conVarias!.resolved[0].alternatives.includes('Ropa de abrigo'));
}

// ── Fabricación improvisada ─────────────────────────────────────────────────
{
  const plan = {
    feasible: true, reason: '', minutes: 20, difficulty: 0.3, skill: 'Sastrería',
    narrative: 'Rasgas la tela con los dientes y las manos.',
    consumes: [{ name: 'Ropa de abrigo', qty: 1 }],
    produces: [{ name: 'Camiseta sin mangas', qty: 1 }, { name: 'Vendas x5', qty: 1 }],
    newItems: [{ name: 'Camiseta sin mangas', kg: 0.3, l: 0.5, tags: ['clothing'], materials: { tela: 0.1 } }],
  };

  let s = newRun();
  s = reducer(s, { type: 'applyTurn', rng: seeded(41), playerText: null, result: turn({ itemsGained: [{ name: 'Ropa de abrigo', qty: 1 }] }) });
  const before = s.minutes;

  const ok = reducer(s, { type: 'improvise', goal: 'hacer una camiseta', plan, rng: () => 0.99 });
  check('improvisar con éxito produce el objeto', countOfName(ok, 'Camiseta sin mangas') === 1);
  check('improvisar registra el objeto nuevo', !!ok.customItems['Camiseta sin mangas']);
  check('improvisar consume el material', countOfName(ok, 'Ropa de abrigo') === 0);
  check('improvisar consume tiempo', ok.minutes === before + 20, `${ok.minutes - before}`);
  check('improvisar da experiencia', (ok.skillXp['Sastrería'] ?? 0) > (s.skillXp['Sastrería'] ?? 0));
  check('improvisar cuenta como fabricado', ok.stats.itemsCrafted === 1);
  check('improvisar deja rastro en el registro', ok.log.some((l) => l.kind === 'player' && /Improviso/.test(l.text)));

  const fail = reducer(s, { type: 'improvise', goal: 'hacer una camiseta', plan, rng: () => 0 });
  check('un fallo no produce el objeto', countOfName(fail, 'Camiseta sin mangas') === 0);
  check('un fallo no ensucia el catálogo', !fail.customItems['Camiseta sin mangas']);
  check('un fallo consume el material igual', countOfName(fail, 'Ropa de abrigo') === 0);

  // Sin el material, ni se intenta.
  const sinMaterial = reducer(newRun(), { type: 'improvise', goal: 'x', plan, rng: () => 0.99 });
  check('sin material no se improvisa', countOfName(sinMaterial, 'Camiseta sin mangas') === 0);
  check('se avisa de lo que falta', sinMaterial.log.some((l) => /Te falta lo principal/.test(l.text)));

  // Idea imposible
  const noViable = reducer(s, {
    type: 'improvise', goal: 'construir un coche',
    plan: { ...plan, feasible: false, reason: 'No tienes ni chasis ni motor.' }, rng: () => 0.99,
  });
  check('una idea inviable se rechaza con motivo', noViable.log.some((l) => /chasis/.test(l.text)));
  check('una idea inviable no consume nada', countOfName(noViable, 'Ropa de abrigo') === 1);

  // La habilidad alta reduce el riesgo: con dificultad 0.3 y nivel 10 baja a ~0
  let experto = s;
  experto = { ...experto, skillXp: { ...experto.skillXp, 'Sastrería': 3550 } };
  const conPericia = reducer(experto, { type: 'improvise', goal: 'x', plan, rng: () => 0.1 });
  check('la habilidad alta salva una tirada justa', countOfName(conPericia, 'Camiseta sin mangas') === 1);
}

// ── Validación del plan de improvisación ────────────────────────────────────
{
  const p = parseImprovise(JSON.stringify({
    feasible: true, consumes: [{ name: 'ropa de abrigo', qty: 1 }],
    produces: [{ name: 'Camiseta apañada', qty: 1 }],
    newItems: [{ name: 'Camiseta apañada', kg: 0.3, l: 0.5, tags: ['clothing'] }],
    minutes: 9999, difficulty: 5, skill: 'sastreria', narrative: 'Rasgas.',
  }), []);
  check('el plan se interpreta', p?.feasible === true);
  check('se acota el tiempo del plan', p?.minutes === 480, `${p?.minutes}`);
  check('se acota la dificultad', p?.difficulty === 0.95, `${p?.difficulty}`);
  check('la habilidad se normaliza', p?.skill === 'Sastrería');
  check('el material a consumir se empareja con el catálogo', p?.consumes[0].name === 'Ropa de abrigo');

  const no = parseImprovise('{"feasible":false,"reason":"Imposible"}', []);
  check('un plan inviable conserva el motivo', no?.feasible === false && no.reason === 'Imposible');

  const vacio = parseImprovise('{"feasible":true,"produces":[]}', []);
  check('un plan sin resultado se descarta', vacio === null);

  const basura = parseImprovise('no soy json', []);
  check('una respuesta ilegible se descarta', basura === null);
}

// ── Resultado ────────────────────────────────────────────────────────────────
console.log(`\n${pass} pruebas superadas${fails.length ? `, ${fails.length} fallidas` : ''}`);
if (fails.length) {
  console.log('\nFALLOS:');
  for (const f of fails) console.log('  ✕ ' + f);
  process.exit(1);
}
