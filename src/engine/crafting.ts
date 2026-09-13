import { RECIPE_BY_ID, ingredientLabel, type Ingredient, type Recipe } from '../data/recipes';
import { itemsForMaterial, MATERIAL_CLASSES, type ItemCatalog } from '../data/items';
import { countOf } from './rules';
import type { GameState, Stack } from './types';

export interface ResolvedIngredient extends Ingredient {
  /** Etiqueta legible: el objeto ideal, o «Cualquier tela». */
  label: string;
  satisfied: boolean;
  /** Nombre de lo que se usa en lugar del ideal, si no es el ideal. */
  usedSub: string | null;
  failChance: number;
  /** Lo que realmente se consumirá. */
  consume: Stack | null;
  have: number;
  /** Otras opciones del inventario que también valdrían. */
  alternatives: string[];
}

export interface CraftPlan {
  recipe: Recipe;
  resolved: ResolvedIngredient[];
  hasMaterials: boolean;
  hasSkill: boolean;
  skillLevel: number;
  /** Probabilidad total de fallo (0..1). */
  failChance: number;
  minutes: number;
  canCraft: boolean;
  blockers: string[];
}

/**
 * Calcula si una receta se puede fabricar con el inventario actual, qué
 * sustitutos se usarían y cuánto riesgo añaden. Función pura: no consume nada.
 */
/**
 * Decide con qué se cubre un ingrediente. Orden de preferencia:
 * 1. el objeto ideal, sin riesgo;
 * 2. un sustituto declarado en la receta, con su penalización;
 * 3. cualquier objeto del inventario que cubra la clase de material pedida,
 *    con la penalización propia de ese objeto — aquí es donde la cinta
 *    entra en el hueco del pegamento.
 */
function resolveIngredient(ing: Ingredient, inventory: Stack[], catalog?: ItemCatalog): ResolvedIngredient {
  const label = ingredientLabel(ing);
  const base = { ...ing, label, alternatives: [] as string[] };

  // Todo lo que el inventario puede aportar para la clase de material pedida.
  const byMaterial = ing.material ? itemsForMaterial(inventory, ing.material, catalog) : [];
  const usable = byMaterial.filter((m) => countOf(inventory, m.name) >= ing.qty);
  const alternatives = usable.map((m) => m.name).filter((n) => n !== ing.name);

  if (ing.name) {
    const have = countOf(inventory, ing.name);
    if (have >= ing.qty) {
      return { ...base, alternatives, satisfied: true, usedSub: null, failChance: 0, consume: { name: ing.name, qty: ing.qty }, have };
    }
    for (const sub of ing.substitutes ?? []) {
      if (countOf(inventory, sub.name) >= ing.qty) {
        return { ...base, alternatives, satisfied: true, usedSub: sub.name, failChance: sub.failChance, consume: { name: sub.name, qty: ing.qty }, have };
      }
    }
  }

  const best = usable[0];
  if (best) {
    return {
      ...base,
      alternatives: alternatives.filter((n) => n !== best.name),
      satisfied: true,
      usedSub: best.name === ing.name ? null : best.name,
      failChance: best.penalty,
      consume: { name: best.name, qty: ing.qty },
      have: countOf(inventory, best.name),
    };
  }

  return {
    ...base, alternatives: [], satisfied: false, usedSub: null, failChance: 0,
    consume: null, have: ing.name ? countOf(inventory, ing.name) : 0,
  };
}

export function planCraft(
  recipeId: string, inventory: Stack[], skillLevel: (skill: string) => number, atWorkshop: boolean,
  catalog?: ItemCatalog,
): CraftPlan | null {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) return null;

  const resolved: ResolvedIngredient[] = recipe.ingredients.map((ing) =>
    resolveIngredient(ing, inventory, catalog),
  );

  const hasMaterials = resolved.every((r) => r.satisfied);
  const level = recipe.skillReq ? skillLevel(recipe.skillReq.skill) : 10;
  const hasSkill = !recipe.skillReq || level >= recipe.skillReq.level;

  // El taller reduce riesgo y tiempo.
  const rawFail = resolved.reduce((s, r) => s + r.failChance, 0);
  const failChance = Math.min(0.85, atWorkshop ? rawFail * 0.5 : rawFail);
  const minutes = Math.round(recipe.minutes * (atWorkshop ? 0.6 : 1));

  const blockers: string[] = [];
  if (!hasMaterials) {
    const missing = resolved.filter((r) => !r.satisfied).map((r) => {
      if (r.material && !r.name) return `${MATERIAL_CLASSES[r.material]?.label ?? r.material} ×${r.qty}`;
      return `${r.name} ×${r.qty}`;
    });
    blockers.push(`Faltan materiales: ${missing.join(', ')}`);
  }
  if (!hasSkill && recipe.skillReq) {
    blockers.push(`Necesitas ${recipe.skillReq.skill} nivel ${recipe.skillReq.level} (tienes ${level})`);
  }

  return { recipe, resolved, hasMaterials, hasSkill, skillLevel: level, failChance, minutes, canCraft: hasMaterials && hasSkill, blockers };
}

export interface CraftOutcome {
  ok: boolean;
  consumed: Stack[];
  produced: Stack[];
  xp: Record<string, number>;
  minutes: number;
  message: string;
}

/** Ejecuta el plan. `rng` se inyecta para poder testear el resultado. */
export function resolveCraft(plan: CraftPlan, rng: () => number): CraftOutcome {
  const consumed = plan.resolved.map((r) => r.consume!).filter(Boolean);
  const subs = plan.resolved.filter((r) => r.usedSub);
  const subNote = subs.length
    ? ` Improvisando con ${subs.map((r) => r.usedSub).join(' y ')} en lugar de ${subs.map((r) => (r.name ?? r.label).toLowerCase()).join(' y ')}.`
    : '';

  const failed = rng() < plan.failChance;
  const xpSkill = plan.recipe.skillReq?.skill;

  if (failed) {
    // Un fallo devuelve la mitad de los materiales, redondeando hacia abajo.
    const salvaged = consumed
      .map((c) => ({ name: c.name, qty: Math.floor(c.qty / 2) }))
      .filter((c) => c.qty > 0);
    return {
      ok: false,
      consumed,
      produced: salvaged,
      xp: xpSkill ? { [xpSkill]: Math.ceil(plan.recipe.xp / 3) } : {},
      minutes: Math.round(plan.minutes * 0.6),
      message: `El montaje de ${plan.recipe.id} sale mal.${subNote} Recuperas parte del material y algo de experiencia.`,
    };
  }

  return {
    ok: true,
    consumed,
    produced: [plan.recipe.result],
    xp: xpSkill ? { [xpSkill]: plan.recipe.xp } : {},
    minutes: plan.minutes,
    message: `Fabricas ${plan.recipe.result.name}${plan.recipe.result.qty > 1 ? ` ×${plan.recipe.result.qty}` : ''}.${subNote}`,
  };
}

/** Atajo: plan de fabricación a partir del estado completo. */
export function planFor(state: GameState, recipeId: string, skillLevel: (skill: string) => number): CraftPlan | null {
  return planCraft(recipeId, state.inventory, skillLevel, isAtWorkshop(state), state.customItems);
}

export function isAtWorkshop(state: GameState): boolean {
  return state.base.established
    && state.base.structures.includes('taller')
    && state.map.currentZone === state.base.location;
}
