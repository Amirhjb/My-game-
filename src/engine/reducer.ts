import { ARCHETYPE_BY_ID } from '../data/archetypes';
import { BOOK_RECIPES, RECIPE_BY_ID } from '../data/recipes';
import { DISEASES, STRUCTURES, WEATHER } from '../data/conditions';
import { getItem } from '../data/items';
import { INJURY_ZONE_IDS, INJURY_ZONES, ALL_SKILLS, XP_TABLE, xpToLevel, makeSkillXp } from '../data/skills';
import { planCraft, resolveCraft, isAtWorkshop } from './crafting';
import {
  addItems, capacityOf, clamp, countOf, dayOf, effectiveLevel, healInjuries, maxHpFor,
  naturalDiseaseRisk, progressDiseases, remitRadiation, removeItems, startingSkills,
  startTreatment, tickModifiers, tickNeeds, upsertModifier,
} from './rules';
import {
  advanceWeather, applyMapUpdate, averageDanger, buildForecast, currentNode, graphDistance,
  isSheltered, rollWeather, weatherImpact,
} from './world';
import {
  MAX_CUSTOM_ITEMS, MAX_DIARY, MAX_HISTORY, MAX_LOG, MAX_PHOTOS, INITIAL_BASE, INITIAL_NEEDS,
  initialState, makeEntry, uid,
} from './state';
import type {
  ActiveDisease, DiaryEntry, GameState, GenreId, ImprovisePlan, Injury, ItemDef, LogEntry,
  Photo, Stack, StructureId, TurnResult,
} from './types';

export type Action =
  | { type: 'setScreen'; screen: GameState['screen'] }
  | { type: 'setGenre'; genre: GenreId }
  | { type: 'setName'; name: string }
  | { type: 'setArchetype'; id: string }
  | { type: 'toggleTrait'; id: string; max: number }
  | { type: 'setNarrator'; id: string }
  | { type: 'startRun'; rng?: () => number }
  | { type: 'log'; kind: LogEntry['kind']; text: string }
  | { type: 'applyTurn'; playerText: string | null; result: TurnResult; rng?: () => number }
  | { type: 'useItem'; name: string; rng?: () => number }
  | { type: 'dropItem'; name: string; qty: number }
  | { type: 'craft'; recipeId: string; rng?: () => number }
  | { type: 'improvise'; goal: string; plan: ImprovisePlan; rng?: () => number }
  | { type: 'registerItems'; items: (ItemDef & { name: string })[] }
  | { type: 'learnRecipes'; ids: string[] }
  | { type: 'establishBase' }
  | { type: 'returnToBase'; rng?: () => number }
  | { type: 'sleep'; hours: number; rng?: () => number }
  | { type: 'build'; structure: StructureId; rng?: () => number }
  | { type: 'deposit'; name: string; qty: number }
  | { type: 'withdraw'; name: string; qty: number }
  | { type: 'setScene'; key: string; description: string }
  | { type: 'addPhoto'; photo: Photo }
  | { type: 'addDiary'; entry: DiaryEntry }
  | { type: 'pushHistory'; role: 'user' | 'assistant'; content: string }
  | { type: 'load'; state: GameState }
  | { type: 'markSaved'; at: number }
  | { type: 'reset' };

const R = () => Math.random();

function pushLog(state: GameState, entries: { kind: LogEntry['kind']; text: string }[]): LogEntry[] {
  if (!entries.length) return state.log;
  const next = [...state.log];
  for (const e of entries) {
    const text = e.text?.trim();
    if (text) next.push(makeEntry(e.kind, text, state.minutes));
  }
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
}

function withLog(state: GameState, entries: { kind: LogEntry['kind']; text: string }[]): GameState {
  return { ...state, log: pushLog(state, entries) };
}

/**
 * Aplica XP y devuelve los avisos de subida de nivel.
 *
 * Hay dos escalas distintas y antes compartían el mismo recorte: lo que reporta
 * el modelo (0-5) y lo que vale una receta (2-10). Con `clamp(0,6) × 50`, una
 * receta de 10 valía lo mismo que una de 6 y una trivial tanto como una difícil.
 */
function grantXp(
  skillXp: Record<string, number>, gains: Record<string, number>, escala: 'model' | 'recipe',
): { skillXp: Record<string, number>; levelUps: string[] } {
  const out = { ...skillXp };
  const levelUps: string[] = [];
  for (const [skill, raw] of Object.entries(gains)) {
    if (!ALL_SKILLS.includes(skill)) continue;
    const gain = escala === 'model'
      ? clamp(Math.round(raw), 0, 5) * 50
      : Math.max(0, Math.round(raw)) * 25;
    if (gain <= 0) continue;
    const before = xpToLevel(out[skill] ?? 0);
    out[skill] = Math.min(XP_TABLE[10], (out[skill] ?? 0) + gain);
    const after = xpToLevel(out[skill]);
    if (after > before) levelUps.push(`${skill} → nivel ${after}`);
  }
  return { skillXp: out, levelUps };
}

/**
 * Rendimientos decrecientes por repetir la misma receta: a partir del tercer
 * crafteo seguido vale la mitad. Evita subir a nivel 10 haciendo vendas.
 */
function repeatFactor(counters: Record<string, number>, recipeId: string): number {
  const veces = counters[`craft:${recipeId}`] ?? 0;
  if (veces < 3) return 1;
  if (veces < 8) return 0.5;
  return 0.25;
}

/**
 * Añade al catálogo de la partida los objetos que el mundo acaba de introducir.
 * Se descarta lo que ya existe y se respeta un tope para no inflar el guardado.
 */
function registerItems(
  current: Record<string, ItemDef>, incoming: (ItemDef & { name: string })[],
): { items: Record<string, ItemDef>; added: string[] } {
  const added: string[] = [];
  if (!incoming.length) return { items: current, added };
  const items = { ...current };
  for (const { name, ...def } of incoming) {
    if (items[name]) continue;
    if (Object.keys(items).length >= MAX_CUSTOM_ITEMS) break;
    items[name] = def;
    added.push(name);
  }
  return added.length ? { items, added } : { items: current, added };
}

function deathCauseFrom(state: GameState): string {
  if (state.needs.thirst <= 0) return 'Deshidratación';
  if (state.needs.hunger <= 0) return 'Inanición';
  if (state.needs.temp <= 33) return 'Hipotermia';
  if (state.needs.temp >= 40) return 'Golpe de calor';
  const grave = state.injuries.find((i) => i.severity === 3);
  if (grave) return `Heridas graves (${INJURY_ZONES[grave.zone].label.toLowerCase()})`;
  const disease = state.diseases.find((d) => d.stage === 2);
  if (disease) return DISEASES[disease.id].label;
  return 'Heridas';
}


/**
 * Avanza el mundo N minutos: clima, enfermedades, lesiones, necesidades, daño y
 * modificadores. Antes cada acción hacía su propia mezcla —`useItem` se saltaba
 * las enfermedades, `build` ni siquiera miraba si te habías muerto— y ahí se
 * colaron varios de los fallos de la auditoría.
 */
interface WorldOpts {
  rng: () => number;
  /** Duerme: el desgaste baja y el sueño no se descuenta. */
  resting?: boolean;
  /** Si el narrador ya ha dicho si está a cubierto, manda sobre el tipo de zona. */
  sheltered?: boolean | null;
  needsDelta?: { hunger?: number; thirst?: number; sleep?: number; temp?: number };
  /** Cuenta para los contadores de Adicto y Paranoico. */
  isAction?: boolean;
}

function advanceWorld(
  state: GameState, minutes: number, opts: WorldOpts,
): { state: GameState; messages: { kind: LogEntry['kind']; text: string }[] } {
  const { rng } = opts;
  const msgs: { kind: LogEntry['kind']; text: string }[] = [];
  const genre = state.genre ?? 'apocalypse';
  let inventory = state.inventory;
  let extraHp = 0;

  // 1) Clima.
  const adv = advanceWeather(state, minutes, genre, rng);
  if (adv.changed && adv.weather.id !== state.weather.id) {
    const w = WEATHER[adv.weather.id];
    msgs.push({ kind: w.severe ? 'warn' : 'system', text: `Cambia el tiempo: ${w.label.toLowerCase()}. ${w.desc}` });
  }
  const bajoTecho = opts.sheltered ?? isSheltered(state.map);
  const impact = weatherImpact(adv.weather, bajoTecho, inventory, minutes, state.traits, rng, state.customItems);
  if (impact.lose.length) inventory = removeItems(inventory, impact.lose);
  for (const m of impact.messages) msgs.push({ kind: impact.hp < 0 ? 'bad' : 'system', text: m });

  // 2) Lesiones: curación natural.
  const healed = healInjuries(state.injuries, minutes, state.traits);
  for (const m of healed.messages) msgs.push({ kind: 'good', text: m });

  // 3) Enfermedades: progresión, tratamiento, remisión y contagio ambiental.
  const progressed = progressDiseases(state.diseases, minutes);
  let diseases = progressed.diseases;
  for (const m of progressed.messages) msgs.push({ kind: /remite|acabado|bastado|mejora/.test(m) ? 'good' : 'warn', text: m });

  const remitted = remitRadiation(diseases, minutes, rng);
  diseases = remitted.diseases;
  for (const m of remitted.messages) msgs.push({ kind: 'good', text: m });

  const risk = naturalDiseaseRisk({ ...state, injuries: healed.injuries, inventory }, minutes, rng);
  for (const d of risk.add) if (!diseases.some((x) => x.id === d.id)) diseases.push(d);
  for (const m of risk.messages) msgs.push({ kind: 'bad', text: m });

  // 4) Necesidades y daño acumulado, una sola vez y con todo lo anterior hecho.
  const tick = tickNeeds(state.needs, minutes, state.traits, diseases, {
    hunger: (opts.needsDelta?.hunger ?? 0) + (impact.needs.hunger ?? 0),
    thirst: (opts.needsDelta?.thirst ?? 0) + (impact.needs.thirst ?? 0),
    sleep: (opts.needsDelta?.sleep ?? 0) + (impact.needs.sleep ?? 0),
    temp: (opts.needsDelta?.temp ?? 0) + (impact.needs.temp ?? 0),
  }, { resting: opts.resting });
  for (const w of tick.warnings) msgs.push({ kind: 'warn', text: w });
  const needs = { ...tick.needs };

  // 5) Rasgos con efecto periódico.
  const counters = { ...state.counters };
  let modifiers = state.modifiers;

  if (opts.isAction && state.traits.includes('adicto')) {
    counters.adicto = (counters.adicto ?? 0) + 1;
    if (counters.adicto % 5 === 0) {
      const dose = inventory.find((s) => s.name === 'Morfina' || s.name === 'Alcohol');
      if (dose) {
        inventory = removeItems(inventory, [{ name: dose.name, qty: 1 }]);
        msgs.push({ kind: 'system', text: `Sientes el tirón. Consumes ${dose.name} y el malestar cede.` });
      } else {
        extraHp -= 8;
        modifiers = upsertModifier(modifiers, {
          id: 'abstinencia', label: 'Síndrome de abstinencia',
          skills: { '*': 2 }, turns: 4, kind: 'debuff',
        });
        msgs.push({ kind: 'bad', text: 'La abstinencia te sacude: temblores, sudor frío y todo te sale peor durante un rato.' });
      }
    }
  }
  if (opts.isAction && state.traits.includes('claustrofobico') && bajoTecho) {
    needs.sleep = clamp(needs.sleep - 7, 0, 100);
    needs.hunger = clamp(needs.hunger - 4, 0, 100);
    msgs.push({ kind: 'warn', text: 'Las paredes se te echan encima. La ansiedad te consume más rápido aquí dentro.' });
  }
  if (opts.isAction && state.traits.includes('paranoico')) {
    counters.paranoico = (counters.paranoico ?? 0) + 1;
    if (counters.paranoico % 5 === 0) {
      const events = [
        { text: 'Una sombra en el rabillo del ojo. Juras que alguien te sigue.', sleep: -6, hp: 0 },
        { text: 'Escuchas pasos que no existen y el corazón se te dispara.', sleep: 0, hp: -4 },
        { text: 'Convencido de que te han tocado las cosas, revisas el petate tres veces.', sleep: -5, hp: 0 },
        { text: 'Crees oír voces al otro lado de la pared. Tardas horas en calmarte.', sleep: -5, hp: -3 },
      ];
      const ev = events[Math.floor(rng() * events.length)];
      needs.sleep = clamp(needs.sleep + ev.sleep, 0, 100);
      extraHp += ev.hp;
      msgs.push({ kind: 'warn', text: `👁 ${ev.text}` });
    }
  }

  // 6) Miedo y temple en zonas peligrosas: Cobarde y Valiente dejan de ser texto.
  const peligro = currentNode(state.map)?.danger ?? 1;
  if (peligro >= 4 && state.traits.includes('cobarde')) {
    modifiers = upsertModifier(modifiers, {
      id: 'panico', label: 'Pánico', skills: { '*': 2 }, turns: 2, kind: 'debuff',
    });
  } else if (peligro >= 4 && state.traits.includes('valiente')) {
    modifiers = upsertModifier(modifiers, {
      id: 'temple', label: 'Sangre fría', skills: { '*': 1 }, turns: 2, kind: 'buff',
    });
  }

  // 7) Sobrecarga: la interfaz ya avisaba, pero no penalizaba nada.
  const cap = capacityOf(inventory, effectiveLevel(state, 'Fuerza'),
    state.base.established && state.base.structures.includes('almacen') && state.map.currentZone === state.base.location,
    state.customItems);
  if (cap.over) {
    modifiers = upsertModifier(modifiers, {
      id: 'sobrecarga', label: 'Sobrecargado', skills: { 'Sigilo': 1, 'Rastreo': 1 }, turns: 2, kind: 'debuff',
    });
  }

  // 8) Modificadores temporales.
  if (impact.modifier) modifiers = upsertModifier(modifiers, { ...impact.modifier, kind: 'debuff' });
  const modTick = tickModifiers(modifiers);
  modifiers = modTick.modifiers;
  for (const m of modTick.expired) msgs.push({ kind: 'system', text: `Se te pasa: ${m.label.toLowerCase()}.` });

  const hp = clamp(state.hp + impact.hp + tick.hpDelta + extraHp, 0, state.maxHp);
  const damageTaken = state.stats.damageTaken + Math.max(0, -(impact.hp + tick.hpDelta + extraHp));

  return {
    state: {
      ...state,
      minutes: state.minutes + minutes,
      inventory,
      weather: adv.weather,
      forecast: adv.forecast,
      weatherAccum: adv.accum,
      injuries: healed.injuries,
      diseases,
      modifiers,
      needs,
      hp,
      counters,
      stats: { ...state.stats, damageTaken, daysSurvived: dayOf(state.minutes + minutes) },
    },
    messages: msgs,
  };
}

/** Cierra la partida si el personaje ha llegado a cero. */
function checkDeath(state: GameState): GameState {
  if (state.hp > 0 || state.screen === 'death') return state;
  const cause = deathCauseFrom(state);
  return withLog({ ...state, screen: 'death', deathCause: cause },
    [{ kind: 'bad', text: `Aquí termina la historia de ${state.charName}. Causa: ${cause.toLowerCase()}.` }]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Turno completo — una sola transición atómica
// ─────────────────────────────────────────────────────────────────────────────
function applyTurn(state: GameState, playerText: string | null, result: TurnResult, rng: () => number): GameState {
  const msgs: { kind: LogEntry['kind']; text: string }[] = [];
  if (playerText) msgs.push({ kind: 'player', text: playerText });
  if (result.narrative) msgs.push({ kind: 'story', text: result.narrative });

  const minutes = clamp(Math.round(result.timeMinutes), 1, 720);

  // 1) Objetos que el mundo introduce, antes de repartirlos.
  const registered = registerItems(state.customItems, result.newItems);
  const customItems = registered.items;
  if (registered.added.length) {
    msgs.push({ kind: 'system', text: `Anotas en tu inventario algo que no habías visto antes: ${registered.added.join(', ')}.` });
  }

  // 2) Objetos ganados y perdidos.
  let inventory = state.inventory;
  if (result.itemsGained.length) {
    inventory = addItems(inventory, result.itemsGained);
    msgs.push({ kind: 'good', text: `Obtienes: ${result.itemsGained.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}.` });
  }
  if (result.itemsLost.length) {
    const real = result.itemsLost.filter((i) => countOf(state.inventory, i.name) > 0);
    if (real.length) {
      inventory = removeItems(inventory, real);
      msgs.push({ kind: 'bad', text: `Pierdes: ${real.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}.` });
    }
  }

  // 3) Recetas aprendidas: por libro o porque el mundo te las ha enseñado.
  let knownRecipes = state.knownRecipes;
  for (const { name } of result.itemsGained) {
    const learned = (BOOK_RECIPES[name] ?? []).filter((r) => !knownRecipes.includes(r));
    if (learned.length) {
      knownRecipes = [...knownRecipes, ...learned];
      msgs.push({ kind: 'good', text: `Leyendo «${name}» aprendes: ${learned.join(', ')}.` });
    }
  }
  const taught = result.recipesLearned.filter((r) => RECIPE_BY_ID[r] && !knownRecipes.includes(r));
  if (taught.length) {
    knownRecipes = [...knownRecipes, ...taught];
    msgs.push({ kind: 'good', text: `Aprendes a fabricar: ${taught.join(', ')}.` });
  }

  // 4) Mapa. Va antes del clima: estar a cubierto depende de la zona nueva.
  let map = state.map;
  let zonesDiscovered = state.stats.zonesDiscovered;
  if (result.mapUpdate) {
    const applied = applyMapUpdate(map, result.mapUpdate, dayOf(state.minutes + minutes), rng);
    map = applied.map;
    if (applied.discovered.length) {
      zonesDiscovered += applied.discovered.length;
      msgs.push({ kind: 'system', text: `Nueva zona en el mapa: ${applied.discovered.join(', ')}.` });
    }
  }

  // 5) Lesiones y enfermedades que indica el narrador.
  let injuries: Injury[] = state.injuries.map((i) => ({ ...i }));
  for (const upd of result.injuriesUpdate) {
    if (!INJURY_ZONE_IDS.includes(upd.zone)) continue;
    if (upd.action === 'add') {
      const existing = injuries.find((i) => i.zone === upd.zone);
      if (existing) {
        if (upd.severity > existing.severity) {
          existing.severity = upd.severity;
          existing.label = upd.label || existing.label;
          existing.age = 0;
          msgs.push({ kind: 'bad', text: `Tu lesión en ${INJURY_ZONES[upd.zone].label.toLowerCase()} empeora: ${existing.label}` });
        }
      } else {
        injuries.push({ zone: upd.zone, severity: upd.severity, label: upd.label || 'Herida', age: 0 });
        msgs.push({ kind: 'bad', text: `Nueva lesión — ${INJURY_ZONES[upd.zone].label}: ${upd.label || 'herida'}.` });
      }
    } else if (injuries.some((i) => i.zone === upd.zone)) {
      injuries = injuries.filter((i) => i.zone !== upd.zone);
      msgs.push({ kind: 'good', text: `Tu lesión en ${INJURY_ZONES[upd.zone].label.toLowerCase()} ya no te limita.` });
    }
  }

  let diseases: ActiveDisease[] = state.diseases.map((d) => ({ ...d }));
  for (const upd of result.diseasesUpdate) {
    if (!(upd.id in DISEASES)) continue;
    const def = DISEASES[upd.id];
    if (upd.action === 'add') {
      if (!diseases.some((d) => d.id === upd.id)) {
        diseases.push({ id: upd.id, stage: 0, ticks: 0 });
        msgs.push({ kind: 'bad', text: `${def.icon} Has contraído ${def.label.toLowerCase()}. ${def.stages[0].desc}${upd.cause ? ` (${upd.cause})` : ''}` });
      }
    } else if (diseases.some((d) => d.id === upd.id)) {
      diseases = diseases.filter((d) => d.id !== upd.id);
      msgs.push({ kind: 'good', text: `Te has curado de: ${def.label.toLowerCase()}.` });
    }
  }

  // 6) Experiencia. El modelo reporta en su propia escala, acotada aparte.
  const { skillXp, levelUps } = grantXp(state.skillXp, result.skillXp, 'model');
  for (const l of levelUps) msgs.push({ kind: 'good', text: `⬆ ${l}` });

  // 7) El mundo avanza: clima, enfermedades, necesidades, daño, modificadores.
  const base: GameState = {
    ...state, inventory, customItems, knownRecipes, map, injuries, diseases, skillXp,
    location: result.location?.trim() || map.currentZone || state.location,
    sceneDescription: result.sceneDescription || state.sceneDescription,
  };
  const world = advanceWorld(base, minutes, {
    rng,
    sheltered: result.sheltered,
    isAction: true,
    needsDelta: {
      hunger: clamp(result.hungerChange, -40, 60),
      thirst: clamp(result.thirstChange, -40, 60),
      sleep: clamp(result.sleepChange, -40, 80),
      temp: clamp(result.tempChange, -5, 5),
    },
  });

  const hpChange = clamp(Math.round(result.hpChange), -60, 40);
  let next: GameState = {
    ...world.state,
    hp: clamp(world.state.hp + hpChange, 0, state.maxHp),
    stats: {
      ...world.state.stats,
      actions: state.stats.actions + 1,
      zonesDiscovered,
      damageTaken: world.state.stats.damageTaken + Math.max(0, -hpChange),
      levelsGained: state.stats.levelsGained + levelUps.length,
    },
  };

  next = withLog(next, [...msgs, ...world.messages]);
  return checkDeath(next);
}

// ─────────────────────────────────────────────────────────────────────────────
export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'setScreen':
      return { ...state, screen: action.screen };

    case 'setGenre':
      return { ...state, genre: action.genre };

    case 'setName':
      return { ...state, charName: action.name.slice(0, 32) };

    case 'setArchetype':
      return { ...state, archetypeId: action.id };

    case 'toggleTrait': {
      const has = state.traits.includes(action.id);
      if (!has && state.traits.length >= action.max) return state;
      return {
        ...state,
        traits: has ? state.traits.filter((t) => t !== action.id) : [...state.traits, action.id],
      };
    }

    case 'setNarrator':
      return { ...state, narrator: action.id };

    case 'startRun': {
      const rng = action.rng ?? R;
      const arch = state.archetypeId ? ARCHETYPE_BY_ID[state.archetypeId] : null;
      const genre = state.genre ?? 'apocalypse';
      if (!arch) return state;

      const { levels, penalty } = startingSkills(arch.bonuses, arch.penalties, state.traits);
      const maxHp = maxHpFor(state.traits);
      const inventory: Stack[] = [];
      for (const name of arch.items) {
        const found = inventory.find((s) => s.name === name);
        if (found) found.qty += 1; else inventory.push({ name, qty: 1 });
      }
      const bookRecipes = arch.items.flatMap((n) => BOOK_RECIPES[n] ?? []);
      const weather = rollWeather(genre, rng);
      const injuries: Injury[] = [];
      if (state.traits.includes('herido_previo')) {
        const zone = INJURY_ZONE_IDS[Math.floor(rng() * INJURY_ZONE_IDS.length)];
        injuries.push({ zone, severity: 1, label: 'Herida antigua que no terminó de cerrar', age: 0 });
      }

      return {
        ...initialState,
        version: state.version,
        screen: 'game',
        genre,
        charName: state.charName.trim() || 'Superviviente',
        archetypeId: state.archetypeId,
        traits: state.traits,
        narrator: state.narrator,
        skillXp: makeSkillXp(levels),
        basePenalty: penalty,
        hp: maxHp,
        maxHp,
        needs: { ...INITIAL_NEEDS },
        injuries,
        minutes: 8 * 60,
        weather,
        forecast: buildForecast(weather, genre, rng),
        map: { nodes: { Inicio: { type: 'urban', danger: 2, visited: true, x: 400, y: 300, connections: [], discoveredDay: 1 } }, currentZone: 'Inicio' },
        location: 'Inicio',
        inventory,
        knownRecipes: [...new Set([...arch.recipes, ...bookRecipes])],
        stats: { ...initialState.stats, zonesDiscovered: 1 },
      };
    }

    case 'log':
      return withLog(state, [{ kind: action.kind, text: action.text }]);

    case 'applyTurn':
      return applyTurn(state, action.playerText, action.result, action.rng ?? R);

    case 'useItem': {
      const def = getItem(action.name, state.customItems);
      if (!def.use || countOf(state.inventory, action.name) < 1) return state;
      const u = def.use;
      const minutes = u.minutes ?? 5;
      const inventory = u.consumed === false
        ? state.inventory
        : removeItems(state.inventory, [{ name: action.name, qty: 1 }]);

      const msgs: { kind: LogEntry['kind']; text: string }[] = [
        { kind: 'system', text: `${u.verb ?? 'Usas'} ${action.name}.` },
      ];

      // Las curas instantáneas quedan para lo específico y escaso; el resto
      // inicia un tratamiento que baja un estadio cada diez horas.
      let diseases = state.diseases;
      if (u.curesNow?.length) {
        const curadas = diseases.filter((d) => u.curesNow!.includes(d.id));
        if (curadas.length) {
          diseases = diseases.filter((d) => !u.curesNow!.includes(d.id));
          msgs.push({ kind: 'good', text: `Te curas de: ${curadas.map((d) => DISEASES[d.id].label.toLowerCase()).join(', ')}.` });
        }
      }
      if (u.cures?.length) {
        const started = startTreatment(diseases, u.cures);
        diseases = started.diseases;
        if (started.treated.length) {
          msgs.push({ kind: 'good', text: `Empiezas tratamiento contra ${started.treated.map((id) => DISEASES[id as keyof typeof DISEASES].label.toLowerCase()).join(', ')}. Tardará horas en hacer efecto.` });
        }
      }

      let injuries = state.injuries;
      if (u.healInjury) {
        const worst = [...injuries].sort((a, b) => b.severity - a.severity)[0];
        if (worst) {
          const severity = worst.severity - u.healInjury;
          injuries = severity <= 0
            ? injuries.filter((i) => i !== worst)
            : injuries.map((i) => (i === worst ? { ...i, severity: severity as 1 | 2, age: 0 } : i));
          msgs.push({ kind: 'good', text: severity <= 0
            ? `Tratas la lesión en ${INJURY_ZONES[worst.zone].label.toLowerCase()} y queda cerrada.`
            : `Tratas la lesión en ${INJURY_ZONES[worst.zone].label.toLowerCase()}: ahora es menos grave.` });
        }
      }

      const world = advanceWorld({ ...state, inventory, diseases, injuries }, minutes, {
        rng: action.rng ?? R,
        needsDelta: { hunger: u.hunger, thirst: u.thirst, sleep: u.sleep, temp: u.temp },
      });
      const next = withLog({
        ...world.state,
        hp: clamp(world.state.hp + (u.hp ?? 0), 0, state.maxHp),
      }, [...msgs, ...world.messages]);
      return checkDeath(next);
    }

    case 'dropItem': {
      if (countOf(state.inventory, action.name) < 1) return state;
      const inventory = removeItems(state.inventory, [{ name: action.name, qty: action.qty }]);
      return withLog({ ...state, inventory }, [{ kind: 'system', text: `Sueltas ${action.name}${action.qty > 1 ? ` ×${action.qty}` : ''}.` }]);
    }

    case 'craft': {
      const rng = action.rng ?? R;
      const plan = planCraft(action.recipeId, state.inventory, (s) => effectiveLevel(state, s), isAtWorkshop(state), state.customItems);
      if (!plan) return state;
      if (!plan.canCraft) return withLog(state, [{ kind: 'warn', text: plan.blockers.join('. ') }]);

      const out = resolveCraft(plan, rng);
      let inventory = removeItems(state.inventory, out.consumed);
      inventory = addItems(inventory, out.produced);

      // Repetir la misma receta rinde cada vez menos experiencia.
      const factor = repeatFactor(state.counters, action.recipeId);
      const xp = Object.fromEntries(
        Object.entries(out.xp).map(([k, v]) => [k, Math.round(v * factor)]),
      );
      const { skillXp, levelUps } = grantXp(state.skillXp, xp, 'recipe');

      const counters = { ...state.counters, [`craft:${action.recipeId}`]: (state.counters[`craft:${action.recipeId}`] ?? 0) + 1 };
      const world = advanceWorld({ ...state, inventory, skillXp, counters }, out.minutes, { rng });
      const next = withLog({
        ...world.state,
        stats: { ...world.state.stats, itemsCrafted: state.stats.itemsCrafted + (out.ok ? 1 : 0) },
      }, [
        { kind: out.ok ? 'good' : 'bad', text: out.message },
        ...levelUps.map((l) => ({ kind: 'good' as const, text: `⬆ ${l}` })),
        ...world.messages,
      ]);
      return checkDeath(next);
    }

    case 'improvise': {
      const rng = action.rng ?? R;
      const plan = action.plan;
      if (!plan.feasible) {
        return withLog(state, [
          { kind: 'player', text: `Intento improvisar: ${action.goal}` },
          { kind: 'warn', text: plan.reason || 'No consigues apañar nada con lo que llevas encima.' },
        ]);
      }

      // El motor comprueba que de verdad tienes lo que vas a gastar.
      const missing = plan.consumes.filter((c) => countOf(state.inventory, c.name) < c.qty);
      if (missing.length) {
        return withLog(state, [
          { kind: 'player', text: `Intento improvisar: ${action.goal}` },
          { kind: 'warn', text: `Te falta lo principal: ${missing.map((m) => `${m.name} ×${m.qty}`).join(', ')}.` },
        ]);
      }

      // La habilidad relevante baja la dificultad: nivel 10 se come medio riesgo.
      const level = plan.skill ? effectiveLevel(state, plan.skill) : 3;
      const difficulty = clamp(plan.difficulty - (level - 1) * 0.05, 0.02, 0.95);
      const success = rng() >= difficulty;

      const registered = registerItems(state.customItems, plan.newItems);
      let inventory = removeItems(state.inventory, plan.consumes);

      const msgs: { kind: LogEntry['kind']; text: string }[] = [
        { kind: 'player', text: `Improviso: ${action.goal}` },
      ];
      if (plan.narrative) msgs.push({ kind: 'story', text: plan.narrative });

      let minutes = plan.minutes;
      let xp: Record<string, number> = {};

      if (success) {
        inventory = addItems(inventory, plan.produces);
        msgs.push({
          kind: 'good',
          text: `Te sale: ${plan.produces.map((p) => `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''}`).join(', ')}.`
            + (plan.consumes.length ? ` Has gastado ${plan.consumes.map((c) => c.name).join(', ')}.` : ''),
        });
        if (plan.skill) xp = { [plan.skill]: Math.max(2, Math.round(difficulty * 12)) };
      } else {
        // Un fallo devuelve la mitad de lo gastado, como en el crafteo con receta.
        const salvage = plan.consumes
          .map((c) => ({ name: c.name, qty: Math.floor(c.qty / 2) }))
          .filter((c) => c.qty > 0);
        inventory = addItems(inventory, salvage);
        minutes = Math.round(plan.minutes * 0.6);
        msgs.push({
          kind: 'bad',
          text: 'No sale. Entre las manos se te queda una cosa inservible'
            + (salvage.length ? `, aunque recuperas ${salvage.map((c) => c.name).join(', ')}.` : '.'),
        });
        if (plan.skill) xp = { [plan.skill]: 1 };  // fallar enseña poco
      }

      const { skillXp, levelUps } = grantXp(state.skillXp, xp, 'recipe');
      for (const l of levelUps) msgs.push({ kind: 'good', text: `⬆ ${l}` });

      const world = advanceWorld({
        ...state, inventory, skillXp,
        customItems: success ? registered.items : state.customItems,
      }, minutes, { rng });

      const next = withLog({
        ...world.state,
        stats: { ...world.state.stats, itemsCrafted: state.stats.itemsCrafted + (success ? 1 : 0) },
      }, [...msgs, ...world.messages]);
      return checkDeath(next);
    }

    case 'registerItems': {
      const registered = registerItems(state.customItems, action.items);
      if (!registered.added.length) return state;
      return { ...state, customItems: registered.items };
    }

    case 'learnRecipes': {
      const learned = action.ids.filter((id) => RECIPE_BY_ID[id] && !state.knownRecipes.includes(id));
      if (!learned.length) return state;
      return withLog(
        { ...state, knownRecipes: [...state.knownRecipes, ...learned] },
        [{ kind: 'good', text: `Aprendes: ${learned.join(', ')}.` }],
      );
    }

    case 'establishBase': {
      const node = currentNode(state.map);
      if (!node) return withLog(state, [{ kind: 'warn', text: 'Todavía no conoces esta zona lo suficiente.' }]);
      if (node.danger > 2) {
        return withLog(state, [{ kind: 'warn', text: `Esta zona es demasiado peligrosa (nivel ${node.danger}). Busca un sitio de peligro 1 o 2.` }]);
      }
      if (state.base.established && state.base.location === state.map.currentZone) return state;
      const zone = state.map.currentZone;
      const nodes = { ...state.map.nodes };
      if (state.base.location && nodes[state.base.location]) {
        nodes[state.base.location] = { ...nodes[state.base.location], isBase: false };
      }
      nodes[zone] = { ...nodes[zone], isBase: true };
      return withLog({
        ...state,
        map: { ...state.map, nodes },
        base: { ...state.base, established: true, location: zone, name: `Refugio — ${zone}`, lastVisited: state.minutes },
      }, [{ kind: 'good', text: `Estableces tu refugio en ${zone}. Aquí puedes construir, almacenar y descansar de verdad.` }]);
    }

    case 'returnToBase': {
      const rng = action.rng ?? R;
      if (!state.base.established) {
        return withLog(state, [{ kind: 'warn', text: 'Todavía no tienes un refugio al que volver.' }]);
      }
      if (state.map.currentZone === state.base.location) {
        return withLog(state, [{ kind: 'system', text: 'Ya estás en el refugio.' }]);
      }
      // Antes eran 150 minutos fijos, estuvieras a una zona o a doce.
      const saltos = graphDistance(state.map, state.map.currentZone, state.base.location);
      const minutes = clamp(Math.round(90 * Math.max(1, saltos)), 60, 720);
      const daysAway = Math.floor((state.minutes - state.base.lastVisited) / 1440);
      const msgs: { kind: LogEntry['kind']; text: string }[] = [
        { kind: 'system', text: `Haces el camino de vuelta al refugio: ${saltos} ${saltos === 1 ? 'zona' : 'zonas'} de viaje. ${daysAway >= 1 ? `Llevabas ${daysAway} ${daysAway === 1 ? 'día' : 'días'} fuera.` : ''}`.trim() },
      ];
      let storage = state.base.storage;

      if (state.base.structures.includes('huerto') && daysAway >= 2) {
        const qty = Math.floor(daysAway / 2);
        storage = addItems(storage, [{ name: 'Lata de comida', qty }]);
        msgs.push({ kind: 'good', text: `El huerto ha dado ${qty} ración(es) mientras no estabas.` });
      }
      if (state.base.structures.includes('pozo') && daysAway >= 1) {
        const qty = Math.min(6, daysAway);
        storage = addItems(storage, [{ name: 'Agua (500ml)', qty }]);
        msgs.push({ kind: 'good', text: `La recogida de agua ha acumulado ${qty} cantimplora(s).` });
      }
      if (!state.base.structures.includes('muro') && daysAway >= 3 && storage.length && rng() < 0.4) {
        const losses: Stack[] = [];
        const pool = [...storage];
        const count = Math.min(pool.length, 1 + Math.floor(rng() * 3));
        for (let i = 0; i < count; i++) {
          const idx = Math.floor(rng() * pool.length);
          losses.push({ name: pool[idx].name, qty: 1 });
          pool.splice(idx, 1);
        }
        storage = removeItems(storage, losses);
        msgs.push({ kind: 'bad', text: `Alguien ha entrado en el refugio: falta ${losses.map((l) => l.name).join(', ')}. Un muro lo evitaría.` });
      }

      // Riesgo de encuentro proporcional al peligro medio del camino.
      const peligroMedio = averageDanger(state.map, state.map.currentZone, state.base.location);
      if (peligroMedio >= 3 && rng() < 0.12 * peligroMedio) {
        const dano = Math.round(4 + rng() * 6 * peligroMedio);
        msgs.push({ kind: 'bad', text: `El camino no estaba tranquilo. Llegas al refugio con ${dano} de vida menos.` });
        state = { ...state, hp: clamp(state.hp - dano, 0, state.maxHp) };
      }

      const map = { ...state.map, currentZone: state.base.location };
      const world = advanceWorld({
        ...state, map, location: state.base.location,
        base: { ...state.base, storage, lastVisited: state.minutes + minutes },
      }, minutes, { rng });

      const next = withLog(world.state, [...msgs, ...world.messages]);
      return checkDeath(next);
    }

    case 'sleep': {
      const rng = action.rng ?? R;
      const hours = clamp(Math.round(action.hours), 1, 12);
      const minutes = hours * 60;
      const enRefugio = state.base.established && state.map.currentZone === state.base.location;
      const camastro = enRefugio && state.base.structures.includes('cama');
      const muro = enRefugio && state.base.structures.includes('muro');
      const generador = enRefugio && state.base.structures.includes('generador');
      const bajoTecho = isSheltered(state.map) || enRefugio;

      const msgs: { kind: LogEntry['kind']; text: string }[] = [
        { kind: 'player', text: `Duermo ${hours} ${hours === 1 ? 'hora' : 'horas'}.` },
      ];

      // El sueño que se recupera depende de dónde duermas. El camastro por fin
      // hace lo que promete su descripción, y no solo al volver de un viaje.
      const calidad = camastro ? 16 : bajoTecho ? 12 : 9;
      let recuperado = hours * calidad;
      let despertado = false;

      // Riesgo nocturno: el muro y el generador sirven justo para esto.
      const peligro = currentNode(state.map)?.danger ?? 2;
      let riesgo = peligro * 0.028 * hours;
      if (muro) riesgo *= 0.12;
      if (generador) riesgo *= 0.5;
      if (enRefugio) riesgo *= 0.6;
      if (!bajoTecho) riesgo *= 1.8;

      let hpExtra = camastro ? 5 : 0;
      if (rng() < Math.min(0.7, riesgo)) {
        despertado = true;
        recuperado *= 0.45;
        const dano = Math.round(3 + rng() * 5 * peligro);
        hpExtra -= dano;
        msgs.push({ kind: 'bad', text: muro
          ? `Algo golpea el muro de madrugada. No entra, pero ya no vuelves a dormirte. Pierdes ${dano} de vida entre el susto y el frío.`
          : `Te despiertas de golpe: no estabas solo. Sales de ahí con ${dano} de vida menos y sin haber descansado.` });
      } else {
        msgs.push({ kind: 'good', text: camastro
          ? 'El camastro cumple. Duermes de un tirón.'
          : bajoTecho ? 'Duermes a cubierto, con un ojo medio abierto.' : 'Duermes a la intemperie, mal y a ratos.' });
      }

      const world = advanceWorld(state, minutes, {
        rng,
        resting: true,
        sheltered: bajoTecho,
        needsDelta: { sleep: Math.round(recuperado) },
      });

      const next = withLog({
        ...world.state,
        hp: clamp(world.state.hp + hpExtra, 0, state.maxHp),
        counters: { ...world.state.counters, ultimoSueno: world.state.minutes },
      }, [...msgs, ...world.messages]);
      return checkDeath(despertado ? next : next);
    }

    case 'build': {
      const def = STRUCTURES[action.structure];
      if (!def) return state;
      if (!state.base.established) return withLog(state, [{ kind: 'warn', text: 'Primero necesitas establecer un refugio.' }]);
      if (state.map.currentZone !== state.base.location) {
        return withLog(state, [{ kind: 'warn', text: 'Tienes que estar en el refugio para construir.' }]);
      }
      if (state.base.structures.includes(action.structure)) return state;
      const level = effectiveLevel(state, def.req.skill);
      if (level < def.req.level) {
        return withLog(state, [{ kind: 'warn', text: `Necesitas ${def.req.skill} nivel ${def.req.level} para ${def.label} (tienes ${level}).` }]);
      }
      const missing = def.mats.filter((m) => countOf(state.inventory, m.name) < m.qty);
      if (missing.length) {
        return withLog(state, [{ kind: 'warn', text: `Te faltan materiales: ${missing.map((m) => `${m.name} ×${m.qty}`).join(', ')}.` }]);
      }

      const inventory = removeItems(state.inventory, def.mats);
      const { skillXp, levelUps } = grantXp(state.skillXp, { [def.req.skill]: 6 }, 'recipe');
      const world = advanceWorld({
        ...state, inventory, skillXp,
        base: { ...state.base, structures: [...state.base.structures, action.structure] },
      }, def.minutes, { rng: action.rng ?? R, sheltered: true });

      const next = withLog(world.state, [
        { kind: 'good', text: `Construyes ${def.icon} ${def.label}. ${def.desc}` },
        ...levelUps.map((l) => ({ kind: 'good' as const, text: `⬆ ${l}` })),
        ...world.messages,
      ]);
      // Construir cuesta horas, y esas horas pueden matarte de sed.
      return checkDeath(next);
    }

    case 'deposit': {
      const qty = Math.min(action.qty, countOf(state.inventory, action.name));
      if (qty < 1) return state;
      return {
        ...state,
        inventory: removeItems(state.inventory, [{ name: action.name, qty }]),
        base: { ...state.base, storage: addItems(state.base.storage, [{ name: action.name, qty }]) },
      };
    }

    case 'withdraw': {
      const qty = Math.min(action.qty, countOf(state.base.storage, action.name));
      if (qty < 1) return state;
      return {
        ...state,
        inventory: addItems(state.inventory, [{ name: action.name, qty }]),
        base: { ...state.base, storage: removeItems(state.base.storage, [{ name: action.name, qty }]) },
      };
    }

    case 'setScene':
      return { ...state, sceneKey: action.key, sceneDescription: action.description || state.sceneDescription };

    case 'addPhoto': {
      const photos = [...state.photos, action.photo];
      return {
        ...state,
        photos: photos.length > MAX_PHOTOS ? photos.slice(photos.length - MAX_PHOTOS) : photos,
        stats: { ...state.stats, photosTaken: state.stats.photosTaken + 1 },
      };
    }

    case 'addDiary': {
      const diary = [...state.diary, action.entry];
      return { ...state, diary: diary.length > MAX_DIARY ? diary.slice(diary.length - MAX_DIARY) : diary };
    }

    case 'pushHistory': {
      const history = [...state.history, { role: action.role, content: action.content }];
      return { ...state, history: history.length > MAX_HISTORY ? history.slice(history.length - MAX_HISTORY) : history };
    }

    case 'load':
      return action.state;

    case 'markSaved':
      return { ...state, savedAt: action.at };

    case 'reset':
      return { ...initialState, version: state.version };

    default:
      return state;
  }
}

/** Capacidad actual, para la UI y para los avisos de sobrecarga. */
export function capacityView(state: GameState) {
  return capacityOf(
    state.inventory,
    effectiveLevel(state, 'Fuerza'),
    state.base.established && state.base.structures.includes('almacen') && state.map.currentZone === state.base.location,
    state.customItems,
  );
}

export { uid, INITIAL_BASE };
