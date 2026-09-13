/* Pruebas del motor: se ejecutan con `npm test`. Sin dependencias externas. */
import { reducer } from '../src/engine/reducer';
import { initialState } from '../src/engine/state';
import { parseTurn, matchItemName, extractJson } from '../src/ai/schema';
import { planCraft, resolveCraft } from '../src/engine/crafting';
import { tickNeeds, capacityOf, addItems, removeItems } from '../src/engine/rules';
import { advanceWeather, applyMapUpdate, rollWeather } from '../src/engine/world';
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
  suggestions: [], ...over,
});

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

  // Fallo: devuelve la mitad del material.
  const failed = resolveCraft(planCraft('Trampa de caza', [{ name: 'Cuerda (5m)', qty: 1 }, { name: 'Herramientas básicas', qty: 1 }], () => 5, false)!, () => 0);
  check('un fallo de fabricación no produce el objeto', !failed.ok);
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

// ── Resultado ────────────────────────────────────────────────────────────────
console.log(`\n${pass} pruebas superadas${fails.length ? `, ${fails.length} fallidas` : ''}`);
if (fails.length) {
  console.log('\nFALLOS:');
  for (const f of fails) console.log('  ✕ ' + f);
  process.exit(1);
}
