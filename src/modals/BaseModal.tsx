import { STRUCTURES, STRUCTURE_IDS } from '../data/conditions';
import { countOf, effectiveLevel } from '../engine/rules';
import { currentNode } from '../engine/world';
import { Modal } from '../components/ui';
import type { GameApi } from '../hooks/useGame';

export function BaseModal({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const { state, dispatch } = api;
  const here = state.base.established && state.map.currentZone === state.base.location;
  const node = currentNode(state.map);

  if (!state.base.established) {
    const canFound = node && node.danger <= 2;
    return (
      <Modal title="Fundar un refugio" icon="🏚️" onClose={onClose}>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-mid)', marginBottom: 18 }}>
          Un refugio es tu punto de anclaje: un sitio donde almacenar lo que no puedes cargar, construir estructuras
          que producen recursos y dormir sin que te cueste la vida. Solo puedes tener uno, y necesita una zona
          razonablemente segura.
        </p>
        <div className="card" style={{ padding: 15, marginBottom: 18 }}>
          <div className="u-eyebrow" style={{ marginBottom: 7 }}>Zona actual</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 5 }}>{state.map.currentZone || '—'}</div>
          <div style={{ fontSize: 12.5, color: canFound ? 'var(--ok)' : 'var(--bad)' }}>
            {!node
              ? 'Todavía no conoces esta zona.'
              : canFound
                ? `Peligro ${node.danger}/5 — vale como refugio.`
                : `Peligro ${node.danger}/5 — demasiado expuesta. Necesitas una zona de peligro 1 o 2.`}
          </div>
        </div>
        <button
          className="btn btn--primary btn--block btn--lg"
          disabled={!canFound}
          onClick={() => dispatch({ type: 'establishBase' })}
        >
          Establecer aquí mi refugio
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      title={state.base.name}
      icon="🏚️"
      onClose={onClose}
      subtitle={<span>{here ? 'Estás aquí' : `En ${state.base.location}`}</span>}
      wide
      footer={
        !here ? (
          <button className="btn btn--primary" onClick={() => { dispatch({ type: 'returnToBase' }); onClose(); }}>
            Volver al refugio (≈2 h 30)
          </button>
        ) : undefined
      }
    >
      {!here && (
        <div className="notice notice--info" style={{ marginBottom: 18 }}>
          <span aria-hidden>ℹ</span>
          <span>Estás lejos del refugio. Para construir o mover objetos tienes que volver.</span>
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <div className="u-eyebrow" style={{ marginBottom: 10 }}>Construcciones</div>
        <div className="grid grid--3">
          {STRUCTURE_IDS.map((id) => {
            const def = STRUCTURES[id];
            const built = state.base.structures.includes(id);
            const level = effectiveLevel(state, def.req.skill);
            const skillOk = level >= def.req.level;
            const matsOk = def.mats.every((m) => countOf(state.inventory, m.name) >= m.qty);
            return (
              <div
                key={id}
                className="card"
                style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 8, opacity: built ? 1 : 0.85, borderColor: built ? 'var(--accent-line)' : undefined }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span aria-hidden style={{ fontSize: 17 }}>{def.icon}</span>
                  <b style={{ fontSize: 13.5, flex: 1 }}>{def.label}</b>
                  {built && <span className="chip chip--pos" style={{ fontSize: 9.5 }}>Listo</span>}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{def.desc}</p>
                {!built && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <span className={`chip ${skillOk ? '' : 'chip--neg'}`}>
                        {def.req.skill} {level}/{def.req.level}
                      </span>
                      {def.mats.map((m) => (
                        <span key={m.name} className={`chip ${countOf(state.inventory, m.name) >= m.qty ? 'chip--pos' : 'chip--neg'}`}>
                          {m.name} {countOf(state.inventory, m.name)}/{m.qty}
                        </span>
                      ))}
                    </div>
                    <button
                      className="btn btn--sm"
                      style={{ marginTop: 'auto' }}
                      disabled={!here || !skillOk || !matsOk}
                      onClick={() => dispatch({ type: 'build', structure: id })}
                    >
                      Construir · {Math.round(def.minutes / 60)} h
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="u-eyebrow" style={{ marginBottom: 10 }}>
          Almacén {state.base.structures.includes('almacen') ? '' : '(sin construir: capacidad limitada)'}
        </div>
        <div className="grid grid--2" style={{ alignItems: 'start' }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>En el refugio</div>
            {state.base.storage.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Vacío.</p>}
            {state.base.storage.map((s) => (
              <button
                key={s.name} className="inv__row" disabled={!here}
                onClick={() => dispatch({ type: 'withdraw', name: s.name, qty: 1 })}
                title="Coger una unidad"
              >
                <span className="inv__name">{s.name}</span>
                <span className="inv__qty">×{s.qty}</span>
                <span aria-hidden style={{ color: 'var(--accent)' }}>←</span>
              </button>
            ))}
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>En tu mochila</div>
            {state.inventory.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Vacía.</p>}
            {state.inventory.map((s) => (
              <button
                key={s.name} className="inv__row" disabled={!here}
                onClick={() => dispatch({ type: 'deposit', name: s.name, qty: 1 })}
                title="Depositar una unidad"
              >
                <span aria-hidden style={{ color: 'var(--accent)' }}>→</span>
                <span className="inv__name">{s.name}</span>
                <span className="inv__qty">×{s.qty}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </Modal>
  );
}
