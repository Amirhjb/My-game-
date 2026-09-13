import { useMemo, useState } from 'react';
import { getItem, itemCategory } from '../data/items';
import { skinItem } from '../data/genres';
import { capacityView } from '../engine/reducer';
import { Meter, Modal } from '../components/ui';
import type { GameApi } from '../hooks/useGame';

export function Inventory({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const { state, dispatch } = api;
  const [selected, setSelected] = useState<string | null>(null);
  const cap = capacityView(state);

  const groups = useMemo(() => {
    const map = new Map<string, { icon: string; order: number; items: typeof state.inventory }>();
    for (const s of state.inventory) {
      const cat = itemCategory(s.name);
      if (!map.has(cat.label)) map.set(cat.label, { icon: cat.icon, order: cat.order, items: [] });
      map.get(cat.label)!.items.push(s);
    }
    return [...map.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([label, g]) => ({ label, ...g, items: [...g.items].sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [state.inventory]);

  const def = selected ? getItem(selected) : null;
  const atBase = state.base.established && state.map.currentZone === state.base.location;

  return (
    <Modal
      title="Mochila"
      icon="🎒"
      onClose={onClose}
      subtitle={<span className="u-num">{cap.usedKg} / {cap.maxKg} kg</span>}
      wide
    >
      <div style={{ display: 'grid', gap: 12, marginBottom: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Meter label="Peso" value={cap.usedKg} max={cap.maxKg} suffix={` / ${cap.maxKg} kg`} critAt={0} warnAt={0} decimals={1}
          color={cap.usedKg > cap.maxKg ? 'var(--bad)' : 'var(--accent)'} />
        <Meter label="Volumen" value={cap.usedL} max={cap.maxL} suffix={` / ${cap.maxL} L`} critAt={0} warnAt={0} decimals={1}
          color={cap.usedL > cap.maxL ? 'var(--bad)' : 'var(--accent)'} />
      </div>

      {cap.over && (
        <div className="notice notice--warn" style={{ marginBottom: 16 }}>
          <span aria-hidden>⚠</span>
          <span>Vas sobrecargado: te mueves peor y el narrador lo tendrá en cuenta. Suelta algo o deposítalo en el refugio.</span>
        </div>
      )}

      {state.inventory.length === 0 && (
        <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No llevas absolutamente nada.</p>
      )}

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: def ? 'minmax(0, 1fr) 250px' : '1fr', alignItems: 'start' }}>
        <div>
          {groups.map((g) => (
            <div key={g.label} className="inv__group">
              <div className="u-eyebrow" style={{ marginBottom: 5 }}>{g.icon} {g.label}</div>
              {g.items.map((s) => {
                const item = getItem(s.name);
                return (
                  <button
                    key={s.name}
                    className="inv__row"
                    aria-pressed={selected === s.name}
                    style={selected === s.name ? { background: 'var(--accent-soft)' } : undefined}
                    onClick={() => setSelected(selected === s.name ? null : s.name)}
                  >
                    <span className="inv__name">{skinItem(s.name, state.genre)}</span>
                    {item.use && <span className="chip chip--accent" style={{ fontSize: 9.5, padding: '1px 6px' }}>Usable</span>}
                    {s.qty > 1 && <span className="inv__qty">×{s.qty}</span>}
                    <span className="inv__weight">{(item.kg * s.qty).toFixed(1)} kg</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {def && selected && (
          <aside className="card" style={{ padding: 14, position: 'sticky', top: 0 }}>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>{skinItem(selected, state.genre)}</h3>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
              <dt>Peso</dt><dd className="u-num">{def.kg} kg</dd>
              <dt>Volumen</dt><dd className="u-num">{def.l} L</dd>
              <dt>Cantidad</dt><dd className="u-num">×{state.inventory.find((s) => s.name === selected)?.qty ?? 0}</dd>
            </dl>
            {def.isContainer && (
              <p style={{ fontSize: 12, color: 'var(--ok)', marginBottom: 10 }}>
                Contenedor: +{def.extraKg} kg y +{def.extraL} L de capacidad.
              </p>
            )}
            {def.use && (
              <ul style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {def.use.hunger ? <li>Hambre {def.use.hunger > 0 ? '+' : ''}{def.use.hunger}</li> : null}
                {def.use.thirst ? <li>Sed {def.use.thirst > 0 ? '+' : ''}{def.use.thirst}</li> : null}
                {def.use.sleep ? <li>Sueño {def.use.sleep > 0 ? '+' : ''}{def.use.sleep}</li> : null}
                {def.use.hp ? <li>Vida {def.use.hp > 0 ? '+' : ''}{def.use.hp}</li> : null}
                {def.use.healInjury ? <li>Reduce la gravedad de una lesión</li> : null}
                {def.use.cures?.length ? <li>Cura enfermedades</li> : null}
                <li style={{ color: 'var(--text-faint)' }}>Tarda {def.use.minutes ?? 5} min</li>
              </ul>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {def.use && (
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => { dispatch({ type: 'useItem', name: selected }); setSelected(null); }}
                >
                  {def.use.verb ?? 'Usar'}
                </button>
              )}
              {atBase && (
                <button
                  className="btn btn--sm"
                  onClick={() => dispatch({ type: 'deposit', name: selected, qty: 1 })}
                >
                  Guardar en el refugio
                </button>
              )}
              <button
                className="btn btn--sm btn--danger"
                onClick={() => { dispatch({ type: 'dropItem', name: selected, qty: 1 }); setSelected(null); }}
              >
                Soltar una unidad
              </button>
            </div>
          </aside>
        )}
      </div>
    </Modal>
  );
}
