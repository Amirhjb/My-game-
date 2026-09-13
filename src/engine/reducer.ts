import { ARCHETYPE_BY_ID } from '../data/archetypes';
import { BOOK_RECIPES, RECIPE_BY_ID } from '../data/recipes';
import { DISEASES, STRUCTURES, WEATHER } from '../data/conditions';
import { getItem } from '../data/items';
import { INJURY_ZONE_IDS, INJURY_ZONES, ALL_SKILLS, XP_TABLE, xpToLevel, makeSkillXp } from '../data/skills';
import { planCraft, resolveCraft, isAtWorkshop } from './crafting';
import {
  addItems, capacityOf, clamp, countOf, dayOf, effectiveLevel, healInjuries, maxHpFor,
  naturalDiseaseRisk, progressDiseases, removeItems, startingSkillLevels, tickModifiers,
  tickNeeds, upsertModifier,
} from './rules';
import {
  advanceWeather, applyMapUpdate, buildForecast, currentNode, isSheltered, rollWeather, weatherImpact,
} from './world';
import {
  MAX_CUSTOM_ITEMS, MAX_HISTORY, MAX_LOG, MAX_PHOTOS, INITIAL_BASE, INITIAL_NEEDS,
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
  | { type: 'useItem'; name: string }
  | { type: 'dropItem'; name: string; qty: number }
  | { type: 'craft'; recipeId: string; rng?: () => number }
  | { type: 'improvise'; goal: string; plan: ImprovisePlan; rng?: () => number }
  | { type: 'registerItems'; items: (ItemDef & { name: string })[] }
  | { type: 'learnRecipes'; ids: string[] }
  | { type: 'establishBase' }
  | { type: 'returnToBase'; rng?: () => number }
  | { type: 'build'; structure: StructureId }
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

/** Aplica XP y devuelve los avisos de subida de nivel. */
function grantXp(
  skillXp: Record<string, number>, gains: Record<string, number>,
): { skillXp: Record<string, number>; levelUps: string[] } {
  const out = { ...skillXp };
  const levelUps: string[] = [];
  for (const [skill, raw] of Object.entries(gains)) {
    if (!ALL_SKILLS.includes(skill)) continue;
    const gain = clamp(Math.round(raw), 0, 6) * 50;
    if (gain <= 0) continue;
    const before = xpToLevel(out[skill] ?? 0);
    out[skill] = Math.min(XP_TABLE[10], (out[skill] ?? 0) + gain);
    const after = xpToLevel(out[skill]);
    if (after > before) levelUps.push(`${skill} → nivel ${after}`);
  }
  return { skillXp: out, levelUps };
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

// ─────────────────────────────────────────────────────────────────────────────
// Turno completo — una sola transición atómica
// ─────────────────────────────────────────────────────────────────────────────
function applyTurn(state: GameState, playerText: string | null, result: TurnResult, rng: () => number): GameState {
  const genre = state.genre ?? 'apocalypse';
  const msgs: { kind: LogEntry['kind']; text: string }[] = [];
  if (playerText) msgs.push({ kind: 'player', text: playerText });
  if (result.narrative) msgs.push({ kind: 'story', text: result.narrative });

  const minutes = clamp(Math.round(result.timeMinutes), 1, 720);
  const nextMinutes = state.minutes + minutes;
  const day = dayOf(nextMinutes);

  // 1) El mundo puede traer objetos que no estaban en el catálogo (una colilla,
  //    una chapa, el cuaderno de otro). Se registran antes de repartirlos.
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
  // El narrador también puede enseñarte una receta sin libro de por medio:
  // unas notas en una pared, alguien que te lo explica, probar hasta que sale.
  const taught = result.recipesLearned.filter((r) => RECIPE_BY_ID[r] && !knownRecipes.includes(r));
  if (taught.length) {
    knownRecipes = [...knownRecipes, ...taught];
    msgs.push({ kind: 'good', text: `Aprendes a fabricar: ${taught.join(', ')}.` });
  }

  // 4) Mapa (antes que el clima: el refugio depende de la zona nueva).
  let map = state.map;
  let zonesDiscovered = state.stats.zonesDiscovered;
  if (result.mapUpdate) {
    const applied = applyMapUpdate(map, result.mapUpdate, day, rng);
    map = applied.map;
    if (applied.discovered.length) {
      zonesDiscovered += applied.discovered.length;
      msgs.push({ kind: 'system', text: `Nueva zona en el mapa: ${applied.discovered.join(', ')}.` });
    }
  }

  // 5) Clima.
  const adv = advanceWeather(state, minutes, genre, rng);
  if (adv.changed && adv.weather.id !== state.weather.id) {
    const w = WEATHER[adv.weather.id];
    msgs.push({ kind: w.severe ? 'warn' : 'system', text: `Cambia el tiempo: ${w.label.toLowerCase()}. ${w.desc}` });
  }
  const sheltered = isSheltered(map);
  const impact = weatherImpact(adv.weather, sheltered, inventory, minutes, state.traits, rng, customItems);
  if (impact.lose.length) inventory = removeItems(inventory, impact.lose);
  for (const m of impact.messages) msgs.push({ kind: impact.hp < 0 ? 'bad' : 'system', text: m });

  // 6) Lesiones: las que indica el narrador + curación natural.
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
    } else {
      if (injuries.some((i) => i.zone === upd.zone)) {
        injuries = injuries.filter((i) => i.zone !== upd.zone);
        msgs.push({ kind: 'good', text: `Tu lesión en ${INJURY_ZONES[upd.zone].label.toLowerCase()} ya no te limita.` });
      }
    }
  }
  const healed = healInjuries(injuries, minutes, state.traits);
  injuries = healed.injuries;
  for (const m of healed.messages) msgs.push({ kind: 'good', text: m });

  // 7) Enfermedades: las del narrador + progresión + riesgo ambiental.
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
  const progressed = progressDiseases(diseases, minutes);
  diseases = progressed.diseases;
  for (const m of progressed.messages) msgs.push({ kind: 'warn', text: m });

  const risk = naturalDiseaseRisk({ ...state, injuries, inventory, needs: state.needs }, minutes, rng);
  for (const d of risk.add) if (!diseases.some((x) => x.id === d.id)) diseases.push(d);
  for (const m of risk.messages) msgs.push({ kind: 'bad', text: m });

  // 8) Necesidades y daño acumulado — una sola vez, con todo lo anterior ya resuelto.
  const tick = tickNeeds(state.needs, minutes, state.traits, diseases, {
    hunger: clamp(result.hungerChange, -40, 60) + (impact.needs.hunger ?? 0),
    thirst: clamp(result.thirstChange, -40, 60) + (impact.needs.thirst ?? 0),
    sleep: clamp(result.sleepChange, -40, 80) + (impact.needs.sleep ?? 0),
    temp: clamp(result.tempChange, -5, 5) + (impact.needs.temp ?? 0),
  });
  for (const w of tick.warnings) msgs.push({ kind: 'warn', text: w });

  // 9) Vida.
  const hpChange = clamp(Math.round(result.hpChange), -60, 40);
  const totalHp = hpChange + impact.hp + tick.hpDelta;
  const hp = clamp(state.hp + totalHp, 0, state.maxHp);
  const damageTaken = state.stats.damageTaken + Math.max(0, -totalHp);

  // 10) Experiencia.
  const { skillXp, levelUps } = grantXp(state.skillXp, result.skillXp);
  for (const l of levelUps) msgs.push({ kind: 'good', text: `⬆ ${l}` });

  // 11) Rasgos con efecto periódico.
  const counters = { ...state.counters };
  let modifiers = state.modifiers;
  let extraHp = 0;
  const needs = { ...tick.needs };

  if (state.traits.includes('adicto')) {
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
  if (state.traits.includes('claustrofobico') && sheltered) {
    needs.sleep = clamp(needs.sleep - 7, 0, 100);
    needs.hunger = clamp(needs.hunger - 4, 0, 100);
    msgs.push({ kind: 'warn', text: 'Las paredes se te echan encima. La ansiedad te consume más rápido aquí dentro.' });
  }
  if (state.traits.includes('paranoico')) {
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

  // 12) Modificadores temporales.
  if (impact.modifier) {
    modifiers = upsertModifier(modifiers, { ...impact.modifier, kind: 'debuff' });
  }
  const modTick = tickModifiers(modifiers);
  modifiers = modTick.modifiers;
  for (const m of modTick.expired) msgs.push({ kind: 'system', text: `Se te pasa: ${m.label.toLowerCase()}.` });

  const finalHp = clamp(hp + extraHp, 0, state.maxHp);

  let next: GameState = {
    ...state,
    minutes: nextMinutes,
    inventory,
    knownRecipes,
    customItems,
    map,
    location: result.location?.trim() || map.currentZone || state.location,
    weather: adv.weather,
    forecast: adv.forecast,
    weatherAccum: adv.accum,
    injuries,
    diseases,
    modifiers,
    needs,
    hp: finalHp,
    skillXp,
    counters,
    sceneDescription: result.sceneDescription || state.sceneDescription,
    stats: {
      ...state.stats,
      actions: state.stats.actions + 1,
      daysSurvived: day,
      zonesDiscovered,
      damageTaken,
      levelsGained: state.stats.levelsGained + levelUps.length,
    },
  };

  next = withLog(next, msgs);

  if (finalHp <= 0) {
    const cause = deathCauseFrom(next);
    next = { ...next, screen: 'death', deathCause: cause };
    next = withLog(next, [{ kind: 'bad', text: `Aquí termina la historia de ${state.charName}. Causa: ${cause.toLowerCase()}.` }]);
  }
  return next;
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

      const levels = startingSkillLevels(arch.bonuses, arch.penalties, state.traits);
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

      let diseases = state.diseases;
      const msgs: { kind: LogEntry['kind']; text: string }[] = [];
      if (u.cures?.length) {
        const cured = diseases.filter((d) => u.cures!.includes(d.id));
        if (cured.length) {
          diseases = diseases.filter((d) => !u.cures!.includes(d.id));
          msgs.push({ kind: 'good', text: `Te curas de: ${cured.map((d) => DISEASES[d.id].label.toLowerCase()).join(', ')}.` });
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

      const tick = tickNeeds(state.needs, minutes, state.traits, diseases, {
        hunger: u.hunger, thirst: u.thirst, sleep: u.sleep, temp: u.temp,
      });
      const hp = clamp(state.hp + (u.hp ?? 0) + tick.hpDelta, 0, state.maxHp);
      msgs.unshift({ kind: 'system', text: `${u.verb ?? 'Usas'} ${action.name}.` });

      let next: GameState = {
        ...state, inventory, diseases, injuries, needs: tick.needs, hp,
        minutes: state.minutes + minutes,
      };
      next = withLog(next, msgs);
      if (hp <= 0) next = { ...next, screen: 'death', deathCause: deathCauseFrom(next) };
      return next;
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
      if (!plan.canCraft) {
        return withLog(state, [{ kind: 'warn', text: plan.blockers.join('. ') }]);
      }
      const out = resolveCraft(plan, rng);
      let inventory = removeItems(state.inventory, out.consumed);
      inventory = addItems(inventory, out.produced);
      const { skillXp, levelUps } = grantXp(state.skillXp, out.xp);
      const tick = tickNeeds(state.needs, out.minutes, state.traits, state.diseases);

      const msgs: { kind: LogEntry['kind']; text: string }[] = [
        { kind: out.ok ? 'good' : 'bad', text: out.message },
        ...levelUps.map((l) => ({ kind: 'good' as const, text: `⬆ ${l}` })),
      ];
      let next: GameState = {
        ...state, inventory, skillXp, needs: tick.needs,
        hp: clamp(state.hp + tick.hpDelta, 0, state.maxHp),
        minutes: state.minutes + out.minutes,
        stats: { ...state.stats, itemsCrafted: state.stats.itemsCrafted + (out.ok ? 1 : 0) },
      };
      next = withLog(next, msgs);
      if (next.hp <= 0) next = { ...next, screen: 'death', deathCause: deathCauseFrom(next) };
      return next;
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
        if (plan.skill) xp = { [plan.skill]: Math.max(1, Math.round(difficulty * 8)) };
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
        if (plan.skill) xp = { [plan.skill]: 1 };
      }

      const { skillXp, levelUps } = grantXp(state.skillXp, xp);
      for (const l of levelUps) msgs.push({ kind: 'good', text: `⬆ ${l}` });
      const tick = tickNeeds(state.needs, minutes, state.traits, state.diseases);

      let next: GameState = {
        ...state,
        inventory,
        customItems: success ? registered.items : state.customItems,
        skillXp,
        needs: tick.needs,
        hp: clamp(state.hp + tick.hpDelta, 0, state.maxHp),
        minutes: state.minutes + minutes,
        stats: { ...state.stats, itemsCrafted: state.stats.itemsCrafted + (success ? 1 : 0) },
      };
      next = withLog(next, msgs);
      if (next.hp <= 0) next = { ...next, screen: 'death', deathCause: deathCauseFrom(next) };
      return next;
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
      const minutes = 150;
      const daysAway = Math.floor((state.minutes - state.base.lastVisited) / 1440);
      const msgs: { kind: LogEntry['kind']; text: string }[] = [
        { kind: 'system', text: `Haces el camino de vuelta al refugio. ${daysAway >= 1 ? `Llevabas ${daysAway} día(s) fuera.` : ''}`.trim() },
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

      const restful = state.base.structures.includes('cama');
      const tick = tickNeeds(state.needs, minutes, state.traits, state.diseases, {
        sleep: restful ? 25 : 0,
      });
      if (restful) msgs.push({ kind: 'good', text: 'El camastro te deja recuperar algo de sueño nada más llegar.' });

      const map = { ...state.map, currentZone: state.base.location };
      let next: GameState = {
        ...state,
        map,
        location: state.base.location,
        minutes: state.minutes + minutes,
        needs: tick.needs,
        hp: clamp(state.hp + tick.hpDelta + (restful ? 5 : 0), 0, state.maxHp),
        base: { ...state.base, storage, lastVisited: state.minutes + minutes },
      };
      next = withLog(next, msgs);
      if (next.hp <= 0) next = { ...next, screen: 'death', deathCause: deathCauseFrom(next) };
      return next;
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
      const tick = tickNeeds(state.needs, def.minutes, state.traits, state.diseases);
      const { skillXp, levelUps } = grantXp(state.skillXp, { [def.req.skill]: 5 });
      let next: GameState = {
        ...state, inventory, skillXp, needs: tick.needs,
        hp: clamp(state.hp + tick.hpDelta, 0, state.maxHp),
        minutes: state.minutes + def.minutes,
        base: { ...state.base, structures: [...state.base.structures, action.structure] },
      };
      next = withLog(next, [
        { kind: 'good', text: `Construyes ${def.icon} ${def.label}. ${def.desc}` },
        ...levelUps.map((l) => ({ kind: 'good' as const, text: `⬆ ${l}` })),
      ]);
      return next;
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

    case 'addDiary':
      return { ...state, diary: [...state.diary, action.entry] };

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
