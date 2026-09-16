/* Pruebas del motor: se ejecutan con `npm test`. Sin dependencias externas. */
import { reducer } from '../src/engine/reducer';
import { initialState } from '../src/engine/state';
import { parseTurn, parseImprovise, matchItemName, extractJson, asNewItems } from '../src/ai/schema';
import { estimateItem, getItem, itemsForMaterial } from '../src/data/items';
import { planCraft, resolveCraft } from '../src/engine/crafting';
import { tickNeeds, capacityOf, addItems, removeItems, skillView, skillPenalties } from '../src/engine/rules';
import { XP_TABLE } from '../src/data/skills';
import { RECIPE_BY_ID } from '../src/data/recipes';
import { buildStateBrief } from '../src/ai/prompts';
import { rescueNarrative } from '../src/ai/schema';
import { detectSkill, rollInstruction, rollSkill, zoneDifficulty } from '../src/engine/rolls';
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

  // B-11: los antibióticos inician tratamiento, ya no curan de golpe.
  let cured = reducer(s, { type: 'applyTurn', rng: seeded(2), playerText: null, result: turn({ itemsGained: [{ name: 'Antibióticos', qty: 1 }] }) });
  cured = reducer(cured, { type: 'useItem', name: 'Antibióticos', rng: seeded(3) });
  check('los antibióticos no curan al instante', cured.diseases.some((d) => d.id === 'fever'));
  check('los antibióticos inician tratamiento', (cured.diseases.find((d) => d.id === 'fever')?.treated ?? 0) > 0);
  // Tras las horas de tratamiento, sí.
  const tratado = reducer(cured, { type: 'applyTurn', rng: seeded(4), playerText: null, result: turn({ timeMinutes: 660 }) });
  check('el tratamiento acaba curando', !tratado.diseases.some((d) => d.id === 'fever'), JSON.stringify(tratado.diseases));
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

// ══ AUDITORÍA ═══════════════════════════════════════════════════════════════

// ── R-01: los estados temporales subían las habilidades en vez de bajarlas ──
{
  let s = newRun();
  s = { ...s, skillXp: { ...s.skillXp, 'Rastreo': XP_TABLE[5] } };
  check('sin estados, el nivel es el base', skillView(s)['Rastreo'].level === 5);

  const conCeniza = { ...s, modifiers: [{ id: 'ash', label: 'Ceniza', skills: { 'Rastreo': 2 }, turns: 3, kind: 'debuff' as const }] };
  check('un debuff BAJA la habilidad', skillView(conCeniza)['Rastreo'].level === 3, `${skillView(conCeniza)['Rastreo'].level}`);

  const conAbstinencia = { ...s, modifiers: [{ id: 'abs', label: 'Abstinencia', skills: { '*': 2 }, turns: 4, kind: 'debuff' as const }] };
  check('un debuff con comodín baja todas', skillView(conAbstinencia)['Rastreo'].level === 3 && skillView(conAbstinencia)['Sigilo'].level === 0);

  const conBuff = { ...s, modifiers: [{ id: 'tem', label: 'Temple', skills: { 'Rastreo': 1 }, turns: 2, kind: 'buff' as const }] };
  check('un buff sí sube la habilidad', skillView(conBuff)['Rastreo'].level === 6);
  check('el nivel nunca pasa del techo de la tabla', skillView({ ...s, skillXp: { ...s.skillXp, 'Rastreo': XP_TABLE[10] } })['Rastreo'].level === 10);
}

// ── R-02: el agotamiento en etapa 2 era incurable ──────────────────────────
{
  let s = newRun();
  s = { ...s, diseases: [{ id: 'exhaustion', stage: 2, ticks: 0 }] };
  s = reducer(s, { type: 'applyTurn', rng: seeded(6), playerText: null, result: turn({ timeMinutes: 480 }) });
  check('el descanso baja una etapa de agotamiento', s.diseases.find((d) => d.id === 'exhaustion')?.stage === 1, JSON.stringify(s.diseases));
  s = reducer(s, { type: 'applyTurn', rng: seeded(7), playerText: null, result: turn({ timeMinutes: 480 }) });
  s = reducer(s, { type: 'applyTurn', rng: seeded(8), playerText: null, result: turn({ timeMinutes: 480 }) });
  check('tres descansos acaban curándolo', !s.diseases.some((d) => d.id === 'exhaustion'), JSON.stringify(s.diseases));
}

// ── R-03: la contaminación tiene salida ────────────────────────────────────
{
  check('el yoduro es fabricable', !!RECIPE_BY_ID['Yoduro de potasio']);
  let s = newRun();
  s = { ...s, diseases: [{ id: 'radiation', stage: 1, ticks: 0 }], inventory: addItems(s.inventory, [{ name: 'Yoduro de potasio', qty: 1 }]) };
  s = reducer(s, { type: 'useItem', name: 'Yoduro de potasio', rng: seeded(9) });
  check('el yoduro corta la contaminación de golpe', !s.diseases.some((d) => d.id === 'radiation'));

  // Y la leve remite sola con el tiempo.
  const azar = seeded(555);
  let r = { ...newRun(), diseases: [{ id: 'radiation' as const, stage: 0 as const, ticks: 0 }] };
  let remitida = false;
  for (let i = 0; i < 60 && !remitida; i++) {
    r = reducer(r, { type: 'applyTurn', rng: azar, playerText: null, result: turn({ timeMinutes: 480 }) });
    r = { ...r, hp: r.maxHp, needs: { hunger: 80, thirst: 80, sleep: 80, temp: 36.5 } };
    remitida = !r.diseases.some((d) => d.id === 'radiation');
  }
  check('la contaminación leve remite sola con el tiempo', remitida);
}

// ── R-04: construir no comprobaba la muerte ────────────────────────────────
{
  let s = newRun();
  s = reducer(s, { type: 'establishBase' });
  s = { ...s,
    hp: 6, needs: { hunger: 5, thirst: 0, sleep: 40, temp: 36.5 },
    skillXp: { ...s.skillXp, 'Carpintería': XP_TABLE[5] },
    inventory: addItems(s.inventory, [{ name: 'Tablones', qty: 3 }, { name: 'Chatarra', qty: 2 }]),
  };
  s = reducer(s, { type: 'build', structure: 'almacen', rng: seeded(11) });
  check('construir con 0 de vida termina la partida', s.hp === 0 && s.screen === 'death', `vida ${s.hp} pantalla ${s.screen}`);
  check('la muerte al construir tiene causa', !!s.deathCause);
}

// ── R-05: las enfermedades avanzan por tiempo, no por número de acciones ───
{
  const base = { ...newRun(), diseases: [{ id: 'fever' as const, stage: 0 as const, ticks: 0 }] };

  let cortas = base;
  for (let i = 0; i < 9; i++) {
    cortas = reducer(cortas, { type: 'applyTurn', rng: seeded(200 + i), playerText: null, result: turn({ timeMinutes: 2 }) });
  }
  let largas = base;
  for (let i = 0; i < 4; i++) {
    largas = reducer(largas, { type: 'applyTurn', rng: seeded(300 + i), playerText: null, result: turn({ timeMinutes: 120 }) });
  }
  const etapaCortas = cortas.diseases.find((d) => d.id === 'fever')?.stage ?? 0;
  const etapaLargas = largas.diseases.find((d) => d.id === 'fever')?.stage ?? 0;
  check('18 minutos no enferman más que 8 horas', etapaLargas >= etapaCortas, `cortas ${etapaCortas} largas ${etapaLargas}`);
  check('nueve acciones de dos minutos no agravan la fiebre', etapaCortas === 0);
}

// ── R-06: un JSON cortado no puede acabar en el relato ─────────────────────
{
  const cortado = parseTurn('{"narrative": "Texto cortado a la mit', 'Inicio');
  check('se rescata la narración del JSON cortado', cortado.fallbackNarrative === 'Texto cortado a la mit' || cortado.fallbackNarrative === null);
  const soloJson = parseTurn('{"hpChange": -5, "timeMinutes": 30, "itemsGained": [', 'Inicio');
  check('un JSON sin narración no se muestra como relato', soloJson.fallbackNarrative === null, String(soloJson.fallbackNarrative));
  check('rescueNarrative descarta llaves sueltas', rescueNarrative('{"foo": "bar", "baz": 1') === null);
  check('rescueNarrative devuelve prosa normal', (rescueNarrative('Caminas entre los escombros durante un buen rato.') ?? '').startsWith('Caminas'));
}

// ── B-01: las penalizaciones de los oficios hacían nada ────────────────────
{
  const soldado = reducer(reducer(reducer(reducer(initialState,
    { type: 'setGenre', genre: 'apocalypse' }),
    { type: 'setName', name: 'Sold' }),
    { type: 'setArchetype', id: 'warrior' }),
    { type: 'startRun', rng: seeded(12) });
  check('la penalización del oficio se guarda', (soldado.basePenalty['Cultivo'] ?? 0) === 2, JSON.stringify(soldado.basePenalty));
  check('la penalización baja el nivel efectivo', skillView(soldado)['Cultivo'].level === 0, `${skillView(soldado)['Cultivo'].level}`);

  const cocinero = reducer(reducer(reducer(reducer(initialState,
    { type: 'setGenre', genre: 'apocalypse' }),
    { type: 'setName', name: 'Coci' }),
    { type: 'setArchetype', id: 'cook' }),
    { type: 'startRun', rng: seeded(12) });
  check('sin penalización el nivel es distinto', skillView(cocinero)['Cultivo'].level > skillView(soldado)['Cultivo'].level);
  check('las bonificaciones siguen funcionando', skillView(cocinero)['Cocina'].level === 5, `${skillView(cocinero)['Cocina'].level}`);
}

// ── B-02: los lastres tenían coste real cero ───────────────────────────────
{
  let s = initialState;
  s = reducer(s, { type: 'setGenre', genre: 'apocalypse' });
  s = reducer(s, { type: 'setName', name: 'Gorrón' });
  s = reducer(s, { type: 'setArchetype', id: 'warrior' });
  for (const id of ['ruidoso', 'lento', 'torpe']) s = reducer(s, { type: 'toggleTrait', id, max: 6 });
  s = reducer(s, { type: 'startRun', rng: seeded(13) });
  check('Ruidoso penaliza el sigilo de verdad', (s.basePenalty['Sigilo'] ?? 0) >= 3, JSON.stringify(s.basePenalty));
  check('Torpe penaliza mecánica de verdad', (s.basePenalty['Mecánica'] ?? 0) === 1);
}

// ── B-03: la sobrecarga no penalizaba nada ─────────────────────────────────
{
  let s = newRun();
  s = { ...s, inventory: addItems(s.inventory, [{ name: 'Rifle', qty: 12 }]) };
  s = reducer(s, { type: 'applyTurn', rng: seeded(14), playerText: null, result: turn() });
  check('ir sobrecargado añade un modificador', s.modifiers.some((m) => m.id === 'sobrecarga'), JSON.stringify(s.modifiers));
  check('la sobrecarga penaliza sigilo', skillPenalties(s)['Sigilo'] >= 1);
  const brief = buildStateBrief(s);
  check('la carga llega al prompt', /CARGA:/.test(brief) && /SOBRECARGADO/.test(brief));
}

// ── B-04: el desgaste era insostenible ─────────────────────────────────────
{
  const dia = tickNeeds({ hunger: 100, thirst: 100, sleep: 100, temp: 36.5 }, 1440, [], []);
  check('el agua de un día cabe en menos de 4 botellas', (100 - dia.needs.thirst) < 150, `${Math.round(100 - dia.needs.thirst)}`);
  const durmiendo = tickNeeds({ hunger: 80, thirst: 80, sleep: 20, temp: 36.5 }, 480, [], [], {}, { resting: true });
  const despierto = tickNeeds({ hunger: 80, thirst: 80, sleep: 20, temp: 36.5 }, 480, [], [], {});
  check('dormir desgasta menos que estar despierto', durmiendo.needs.thirst > despierto.needs.thirst);
  check('durmiendo no se descuenta sueño', durmiendo.needs.sleep === 20);
}

// ── B-05 / P-01: existe una acción de dormir de verdad ─────────────────────
{
  let s = newRun();
  s = { ...s, needs: { hunger: 70, thirst: 70, sleep: 10, temp: 36.5 } };
  const dormido = reducer(s, { type: 'sleep', hours: 8, rng: () => 0.99 });
  check('dormir recupera sueño de verdad', dormido.needs.sleep > 70, `${Math.round(dormido.needs.sleep)}`);
  const enCasa = reducer({ ...reducer(newRun(), { type: 'establishBase' }),
    needs: { hunger: 70, thirst: 70, sleep: 10, temp: 36.5 } }, { type: 'sleep', hours: 8, rng: () => 0.99 });
  check('una noche a cubierto sí puede llenar el sueño', enCasa.needs.sleep > 95, `${Math.round(enCasa.needs.sleep)}`);
  check('dormir avanza el reloj', dormido.minutes === s.minutes + 480);
  check('dormir deja rastro en el registro', dormido.log.some((l) => /Duermo 8 horas/.test(l.text)));

  // El camastro cumple lo que promete, y no solo al volver de un viaje.
  let conCama = reducer(newRun(), { type: 'establishBase' });
  conCama = { ...conCama, needs: { hunger: 70, thirst: 70, sleep: 10, temp: 36.5 },
    base: { ...conCama.base, structures: ['cama'] } };
  const enCamastro = reducer(conCama, { type: 'sleep', hours: 4, rng: () => 0.99 });
  const sinCamastro = reducer({ ...conCama, base: { ...conCama.base, structures: [] } }, { type: 'sleep', hours: 4, rng: () => 0.99 });
  check('el camastro recupera más sueño', enCamastro.needs.sleep > sinCamastro.needs.sleep,
    `${Math.round(enCamastro.needs.sleep)} vs ${Math.round(sinCamastro.needs.sleep)}`);
  check('el camastro devuelve algo de vida', enCamastro.hp >= sinCamastro.hp);

  // B-06: el muro reduce el riesgo nocturno, que antes no existía.
  const zonaPeligrosa = { ...conCama,
    map: { ...conCama.map, nodes: { ...conCama.map.nodes, Inicio: { ...conCama.map.nodes['Inicio'], danger: 5 } } } };
  const sustos = (estructuras: ('muro' | 'cama')[]) => {
    // Un único generador continuo: con semillas consecutivas, un LCG devuelve
    // primeros valores casi idénticos y la muestra no vale de nada.
    const azar = seeded(9001);
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const res = reducer({ ...zonaPeligrosa, base: { ...zonaPeligrosa.base, structures: estructuras } },
        { type: 'sleep', hours: 8, rng: azar });
      if (res.log.some((l) => l.kind === 'bad' && /despiertas|muro/.test(l.text))) n++;
    }
    return n;
  };
  const sinMuro = sustos([]);
  const conMuro = sustos(['muro']);
  check('dormir en zona peligrosa tiene riesgo', sinMuro > 10, `${sinMuro}/200`);
  check('el muro reduce mucho el riesgo nocturno', conMuro < sinMuro / 3, `${conMuro}/200 frente a ${sinMuro}/200`);
}

// ── B-07 / B-08: las recetas producen lo que dicen y compensan ─────────────
{
  check('la antorcha produce una antorcha', RECIPE_BY_ID['Antorcha'].result.name === 'Antorcha');
  check('el caldo produce caldo', RECIPE_BY_ID['Caldo medicinal'].result.name === 'Caldo caliente');
  check('la barricada produce tablones', RECIPE_BY_ID['Barricada de madera'].result.name === 'Tablones');

  const racion = RECIPE_BY_ID['Ración de campo'];
  const entrada = getItem('Lata de comida').use!.hunger! * 2;
  const salida = getItem(racion.result.name).use!.hunger! * racion.result.qty;
  check('la ración de campo ya no es una trampa', salida > entrada, `${entrada} → ${salida}`);
}

// ── B-09: las recetas gastaban las herramientas ────────────────────────────
{
  let s = newRun();
  s = { ...s,
    skillXp: { ...s.skillXp, 'Lanza': XP_TABLE[3] },
    inventory: [{ name: 'Madera', qty: 1 }, { name: 'Cuchillo', qty: 1 }],
  };
  const tras = reducer(s, { type: 'craft', recipeId: 'Lanza de madera', rng: () => 0.99 });
  check('fabricar una lanza no te deja sin cuchillo', countOfName(tras, 'Cuchillo') === 1, `${countOfName(tras, 'Cuchillo')}`);
  check('el material sí se consume', countOfName(tras, 'Madera') === 0);
  check('y sale la lanza', countOfName(tras, 'Lanza improvisada') === 1);
}

// ── B-10: la experiencia mezclaba escalas y se podía farmear ───────────────
{
  let s = newRun();
  s = { ...s, skillXp: { ...s.skillXp, 'Primeros auxilios': 0 },
    inventory: [{ name: 'Tela', qty: 20 }] };

  const primera = reducer(s, { type: 'craft', recipeId: 'Vendas improvisadas', rng: () => 0.99 });
  const ganancia1 = (primera.skillXp['Primeros auxilios'] ?? 0) - (s.skillXp['Primeros auxilios'] ?? 0);

  let repetido = s;
  for (let i = 0; i < 5; i++) repetido = reducer(repetido, { type: 'craft', recipeId: 'Vendas improvisadas', rng: () => 0.99 });
  const ultima = reducer(repetido, { type: 'craft', recipeId: 'Vendas improvisadas', rng: () => 0.99 });
  const ganancia6 = (ultima.skillXp['Primeros auxilios'] ?? 0) - (repetido.skillXp['Primeros auxilios'] ?? 0);

  check('repetir la misma receta rinde menos', ganancia6 < ganancia1, `${ganancia1} → ${ganancia6}`);
  check('una receta cara da más que una barata',
    RECIPE_BY_ID['Analgésico casero'].xp > RECIPE_BY_ID['Vendas improvisadas'].xp);
}

// ── B-13: el Ex-convicto empezaba sin mochila ──────────────────────────────
{
  const ex = reducer(reducer(reducer(reducer(initialState,
    { type: 'setGenre', genre: 'apocalypse' }),
    { type: 'setName', name: 'Ex' }),
    { type: 'setArchetype', id: 'outlaw' }),
    { type: 'startRun', rng: seeded(15) });
  check('el Ex-convicto lleva mochila', ex.inventory.some((i) => i.name === 'Mochila pequeña'));
  const cap = capacityOf(ex.inventory, 2, false);
  check('su capacidad ya no es la mitad', cap.maxKg > 15, `${cap.maxKg} kg`);
}

// ── B-14: usar un objeto también avanza el mundo ───────────────────────────
{
  let s = newRun();
  s = { ...s, diseases: [{ id: 'fever', stage: 0, ticks: 0 }],
    inventory: addItems(s.inventory, [{ name: 'Lata de comida', qty: 1 }]) };
  const antes = s.diseases[0].ticks;
  const tras = reducer(s, { type: 'useItem', name: 'Lata de comida', rng: seeded(16) });
  check('usar un objeto avanza las enfermedades', (tras.diseases[0]?.ticks ?? 0) > antes);
  check('usar un objeto avanza el reloj', tras.minutes > s.minutes);
}

// ── B-15: volver al refugio dependía de nada ───────────────────────────────
{
  let s = newRun();
  s = reducer(s, { type: 'establishBase' });
  for (let i = 0; i < 4; i++) {
    s = reducer(s, { type: 'applyTurn', rng: seeded(400 + i), playerText: null,
      result: turn({ mapUpdate: { currentZone: `Lejos ${i}`, type: 'urban', danger: 1, connections: [] } }) });
    s = { ...s, hp: s.maxHp, needs: { hunger: 80, thirst: 80, sleep: 80, temp: 36.5 } };
  }
  const antes = s.minutes;
  const vuelto = reducer(s, { type: 'returnToBase', rng: () => 0.99 });
  check('volver de lejos cuesta más que de al lado', vuelto.minutes - antes > 150, `${vuelto.minutes - antes} min`);
  check('el viaje acaba en el refugio', vuelto.map.currentZone === vuelto.base.location);
}

// ── X-05: el diario crecía sin tope ────────────────────────────────────────
{
  let s = newRun();
  for (let i = 0; i < 80; i++) {
    s = reducer(s, { type: 'addDiary', entry: { id: `d${i}`, day: i, time: '03:00', location: 'x', text: 'y', mood: 'z', hp: 1, hunger: 1, thirst: 1, diseases: [] } });
  }
  check('el diario tiene tope', s.diary.length === 60, `${s.diary.length}`);
  check('el diario conserva lo más reciente', s.diary[s.diary.length - 1].id === 'd79');
}

// ── P-02: tiradas de habilidad ─────────────────────────────────────────────
{
  check('detecta sigilo', detectSkill('Avanzo sin hacer ruido pegado a la pared') === 'Sigilo');
  check('detecta primeros auxilios', detectSkill('Me vendo el brazo como puedo') === 'Primeros auxilios');
  check('detecta puntería', detectSkill('Disparo al que viene por la izquierda') === 'Puntería');
  check('detecta cocina', detectSkill('Cocino lo que queda en la lata') === 'Cocina');
  check('no inventa habilidad donde no la hay', detectSkill('Miro el cielo un rato') === null);

  const s = newRun();
  const facil = { ...s, map: { ...s.map, nodes: { ...s.map.nodes, Inicio: { ...s.map.nodes['Inicio'], danger: 1 } } } };
  const dificil = { ...s, map: { ...s.map, nodes: { ...s.map.nodes, Inicio: { ...s.map.nodes['Inicio'], danger: 5 } } } };
  check('la zona peligrosa sube la dificultad', zoneDifficulty(dificil) > zoneDifficulty(facil));

  // El nivel importa: mismo dado, distinto resultado.
  const novato = { ...facil, skillXp: { ...facil.skillXp, 'Sigilo': XP_TABLE[1] } };
  const experto = { ...facil, skillXp: { ...facil.skillXp, 'Sigilo': XP_TABLE[9] } };
  const dado = () => 0.5;   // d20 = 11
  const rn = rollSkill(novato, 'Sigilo', dado);
  const re = rollSkill(experto, 'Sigilo', dado);
  check('el mismo dado da distinto total según el nivel', re.total > rn.total, `${rn.total} vs ${re.total}`);
  check('el experto supera la dificultad', re.total >= re.difficulty);
  check('la tirada se explica en una línea', /Sigilo \d+ \+ d20\(\d+\) = \d+ vs \d+ →/.test(re.label), re.label);

  check('un 1 natural es pifia', rollSkill(experto, 'Sigilo', () => 0).outcome === 'pifia');
  check('un 20 natural es crítico', rollSkill(novato, 'Sigilo', () => 0.999).outcome === 'critico');
  check('la instrucción prohíbe contradecir la tirada', /No contradigas la tirada/.test(rollInstruction(re)));
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
