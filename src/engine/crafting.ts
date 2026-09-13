import { RECIPE_BY_ID, type Ingredient, type Recipe } from '../data/recipes';
import { countOf } from './rules';
import type { GameState, Stack } from './types';

export interface ResolvedIngredient extends Ingredient {
  satisfied: boolean;
  /** Nombre del sustituto empleado, si se usa uno. */
  usedSub: string | null;
  failChance: number;
  /** Lo que realmente se consumirá. */
  consume: Stack | null;
  have: number;
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
export function planCraft(
  recipeId: string, inventory: Stack[], skillLevel: (skill: string) => number, atWorkshop: boolean,
): CraftPlan | null {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) return null;

  const resolved: ResolvedIngredient[] = recipe.ingredients.map((ing) => {
    const have = countOf(inventory, ing.name);
    if (have >= ing.qty) {
      return { ...ing, satisfied: true, usedSub: null, failChance: 0, consume: { name: ing.name, qty: ing.qty }, have };
    }
    for (const sub of ing.substitutes ?? []) {
      if (countOf(inventory, sub.name) >= ing.qty) {
        return { ...ing, satisfied: true, usedSub: sub.name, failChance: sub.failChance, consume: { name: sub.name, qty: ing.qty }, have };
      }
    }
    return { ...ing, satisfied: false, usedSub: null, failChance: 0, consume: null, have };
  });

  const hasMaterials = resolved.every((r) => r.satisfied);
  const level = recipe.skillReq ? skillLevel(recipe.skillReq.skill) : 10;
  const hasSkill = !recipe.skillReq || level >= recipe.skillReq.level;

  // El taller reduce riesgo y tiempo.
  const rawFail = resolved.reduce((s, r) => s + r.failChance, 0);
  const failChance = Math.min(0.85, atWorkshop ? rawFail * 0.5 : rawFail);
  const minutes = Math.round(recipe.minutes * (atWorkshop ? 0.6 : 1));

  const blockers: string[] = [];
  if (!hasMaterials) {
    const missing = resolved.filter((r) => !r.satisfied).map((r) => `${r.name} ×${r.qty}`);
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
    ? ` Sustituyendo ${subs.map((r) => `${r.name} por ${r.usedSub}`).join(' y ')}.`
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

export function isAtWorkshop(state: GameState): boolean {
  return state.base.established
    && state.base.structures.includes('taller')
    && state.map.currentZone === state.base.location;
}
