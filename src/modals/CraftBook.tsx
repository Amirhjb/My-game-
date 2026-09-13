import { useMemo, useState } from 'react';
import { RECIPES, RECIPE_CATEGORIES } from '../data/recipes';
import { MATERIAL_CLASSES } from '../data/items';
import { planCraft, isAtWorkshop } from '../engine/crafting';
import { effectiveLevel } from '../engine/rules';
import { Modal } from '../components/ui';
import type { RecipeCategory } from '../engine/types';
import type { GameApi } from '../hooks/useGame';

/** Fabricación sin receta: describes qué quieres apañar y el juego lo arbitra. */
function Improvise({ api, onDone }: { api: GameApi; onDone: () => void }) {
  const [goal, setGoal] = useState('');
  const busy = api.status === 'improvising';

  const send = async () => {
    const text = goal.trim();
    if (!text || busy) return;
    setGoal('');
    await api.improvise(text);
    onDone();
  };

  return (
    <div className="card" style={{ padding: 15, marginBottom: 20, borderColor: 'var(--accent-line)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span aria-hidden>🛠</span>
        <h3 style={{ fontSize: 14 }}>Improvisar sin receta</h3>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: 11 }}>
        Describe qué quieres apañar con lo que llevas encima. No hace falta que exista una receta:
        si la idea se sostiene en el mundo real, el juego la resuelve y consume los materiales.
        <br />
        <span style={{ color: 'var(--text-faint)' }}>
          Por ejemplo: «arranco las mangas de la camisa para hacer vendas» o «ato el cuchillo al palo con cinta».
        </span>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          placeholder="¿Qué quieres improvisar?"
          value={goal}
          disabled={busy}
          maxLength={200}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
        />
        <button className="btn btn--primary" disabled={busy || !goal.trim()} onClick={() => void send()}>
          {busy ? 'Probando…' : 'Intentar'}
        </button>
      </div>
    </div>
  );
}

export function CraftBook({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const { state, dispatch } = api;
  const [filter, setFilter] = useState<RecipeCategory | 'all'>('all');
  const workshop = isAtWorkshop(state);

  const plans = useMemo(
    () =>
      state.knownRecipes
        .map((id) => planCraft(id, state.inventory, (s) => effectiveLevel(state, s), workshop, state.customItems))
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .filter((p) => filter === 'all' || p.recipe.category === filter)
        .sort((a, b) => Number(b.canCraft) - Number(a.canCraft) || a.recipe.id.localeCompare(b.recipe.id)),
    [state, filter, workshop],
  );

  const unknown = RECIPES.filter((r) => !state.knownRecipes.includes(r.id)).length;

  return (
    <Modal
      title="Manual de fabricación"
      icon="🔧"
      onClose={onClose}
      subtitle={<span>{state.knownRecipes.length} conocidas · {unknown} por descubrir</span>}
      wide
    >
      <Improvise api={api} onDone={onClose} />

      {workshop && (
        <div className="notice notice--info" style={{ marginBottom: 16 }}>
          <span aria-hidden>🔧</span>
          <span>Estás en el taller del refugio: fabricar cuesta un 40 % menos de tiempo y los sustitutos fallan la mitad.</span>
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 16 }} role="tablist">
        <button role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>Todas</button>
        {(Object.keys(RECIPE_CATEGORIES) as RecipeCategory[]).map((c) => (
          <button key={c} role="tab" aria-selected={filter === c} onClick={() => setFilter(c)}>
            <span aria-hidden>{RECIPE_CATEGORIES[c].icon}</span> {RECIPE_CATEGORIES[c].label}
          </button>
        ))}
      </div>

      {plans.length === 0 && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.6 }}>
          {state.knownRecipes.length === 0
            ? 'Todavía no conoces ninguna receta. Se aprenden leyendo manuales o fabricando cosas durante la partida.'
            : 'Ninguna receta en esta categoría.'}
        </p>
      )}

      <div className="grid grid--wide">
        {plans.map((p) => {
          const cat = RECIPE_CATEGORIES[p.recipe.category];
          return (
            <div
              key={p.recipe.id}
              className="card"
              style={{
                padding: 14, display: 'flex', flexDirection: 'column', gap: 9,
                opacity: p.canCraft ? 1 : 0.72,
                borderColor: p.canCraft ? `oklch(75% 0.12 ${cat.hue} / 0.35)` : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span aria-hidden>{cat.icon}</span>
                <h3 style={{ fontSize: 14, flex: 1 }}>{p.recipe.id}</h3>
                <span className="u-num" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{p.minutes} min</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{p.recipe.desc}</p>

              <ul style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {p.resolved.map((ing, i) => (
                  <li key={`${ing.label}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 12 }}>
                    <span aria-hidden style={{ color: ing.satisfied ? 'var(--ok)' : 'var(--bad)', width: 12, flexShrink: 0 }}>
                      {ing.satisfied ? '✓' : '✕'}
                    </span>
                    <span style={{ color: ing.satisfied ? 'var(--text-mid)' : 'var(--text-faint)', flex: 1, lineHeight: 1.45 }}>
                      {ing.label} ×{ing.qty}
                      {ing.usedSub && <span style={{ color: 'var(--warn)' }}> → con {ing.usedSub}</span>}
                      {ing.material && (
                        <span style={{ display: 'block', color: 'var(--text-faint)', fontSize: 10.5 }}>
                          vale cualquier {MATERIAL_CLASSES[ing.material]?.desc ?? ing.material}
                          {ing.alternatives.length > 0 && ` · también tienes: ${ing.alternatives.slice(0, 3).join(', ')}`}
                        </span>
                      )}
                    </span>
                    <span className="u-num" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{ing.have}</span>
                  </li>
                ))}
              </ul>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                <span className="chip chip--accent">→ {p.recipe.result.name} ×{p.recipe.result.qty}</span>
                {p.recipe.skillReq && (
                  <span className={`chip ${p.hasSkill ? '' : 'chip--neg'}`}>
                    {p.recipe.skillReq.skill} {p.skillLevel}/{p.recipe.skillReq.level}
                  </span>
                )}
                {p.failChance > 0 && (
                  <span className="chip" style={{ color: 'var(--warn)' }}>
                    {Math.round(p.failChance * 100)} % de fallo
                  </span>
                )}
              </div>

              <button
                className={`btn btn--sm btn--wrap ${p.canCraft ? 'btn--primary' : ''}`}
                disabled={!p.canCraft}
                style={{ marginTop: 'auto' }}
                onClick={() => dispatch({ type: 'craft', recipeId: p.recipe.id })}
              >
                {p.canCraft ? 'Fabricar' : p.blockers[0]}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
