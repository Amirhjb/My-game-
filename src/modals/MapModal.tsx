import { useEffect, useMemo, useRef, useState } from 'react';
import { ZONE_TYPES } from '../engine/world';
import { Modal } from '../components/ui';
import type { GameState, ZoneType } from '../engine/types';

const TYPE_HUE: Record<ZoneType, number> = {
  urban: 42, wilderness: 150, indoor: 285, underground: 25, water: 220, unknown: 0,
};

export function MapModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => Object.entries(state.map.nodes), [state.map.nodes]);

  // Centramos la vista en la zona actual al abrir el mapa.
  useEffect(() => {
    const current = state.map.nodes[state.map.currentZone];
    const box = boxRef.current?.getBoundingClientRect();
    if (!current || !box) return;
    setView({ x: box.width / 2 - current.x, y: box.height / 2 - current.y, k: 1 });
  }, [state.map.currentZone, state.map.nodes]);

  const edges = useMemo(() => {
    const seen = new Set<string>();
    const out: { a: [number, number]; b: [number, number]; known: boolean }[] = [];
    for (const [name, node] of nodes) {
      for (const conn of node.connections) {
        const other = state.map.nodes[conn];
        if (!other) continue;
        const key = [name, conn].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a: [node.x, node.y], b: [other.x, other.y], known: node.visited && other.visited });
      }
    }
    return out;
  }, [nodes, state.map.nodes]);

  const onWheel = (e: React.WheelEvent) => {
    const k = Math.min(2.4, Math.max(0.35, view.k * (e.deltaY > 0 ? 0.9 : 1.11)));
    setView((v) => ({ ...v, k }));
  };

  return (
    <Modal
      title="Mapa conocido"
      icon="🗺️"
      onClose={onClose}
      subtitle={<span>{nodes.filter(([, n]) => n.visited).length} visitadas · {nodes.length} conocidas</span>}
      wide
      tall
      bodyless
    >
      <div
        ref={boxRef}
        className="mapview"
        onWheel={onWheel}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setView((v) => ({
            ...v,
            x: drag.current!.vx + (e.clientX - drag.current!.x) / v.k,
            y: drag.current!.vy + (e.clientY - drag.current!.y) / v.k,
          }));
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
      >
        <svg width="100%" height="100%" role="img" aria-label="Mapa de zonas conocidas">
          <g transform={`scale(${view.k}) translate(${view.x} ${view.y})`}>
            {edges.map((e, i) => (
              <line
                key={i}
                x1={e.a[0]} y1={e.a[1]} x2={e.b[0]} y2={e.b[1]}
                stroke="var(--line-strong)"
                strokeWidth={1.4 / view.k}
                strokeDasharray={e.known ? undefined : `${4 / view.k} ${4 / view.k}`}
              />
            ))}
            {nodes.map(([name, node]) => {
              const here = name === state.map.currentZone;
              const hue = TYPE_HUE[node.type];
              const r = here ? 15 : node.visited ? 12 : 8;
              return (
                <g
                  key={name}
                  transform={`translate(${node.x} ${node.y})`}
                  onMouseEnter={() => setHover(name)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {here && (
                    <circle r={r + 7} fill="none" stroke="var(--accent)" strokeWidth={1.5 / view.k} opacity={0.5}>
                      <animate attributeName="r" values={`${r + 4};${r + 11};${r + 4}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.55;0;0.55" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    r={r}
                    fill={node.visited ? `oklch(60% 0.1 ${hue} / 0.85)` : 'var(--surface-2)'}
                    stroke={here ? 'var(--accent)' : node.isBase ? 'var(--ok)' : 'var(--line-strong)'}
                    strokeWidth={(here || node.isBase ? 2.2 : 1) / view.k}
                  />
                  {node.isBase && <text textAnchor="middle" y={4 / view.k} fontSize={13 / view.k}>🏚️</text>}
                  {node.visited && !node.isBase && node.danger >= 3 && (
                    <text textAnchor="middle" y={4 / view.k} fontSize={11 / view.k} fill="var(--bad)">!</text>
                  )}
                  <text
                    textAnchor="middle" y={r + 14 / view.k} fontSize={11 / view.k}
                    fill={here ? 'var(--accent)' : node.visited ? 'var(--text-mid)' : 'var(--text-faint)'}
                    style={{ pointerEvents: 'none', fontWeight: here ? 600 : 400 }}
                  >
                    {name}
                  </text>
                  {hover === name && node.visited && (
                    <text textAnchor="middle" y={r + 27 / view.k} fontSize={9.5 / view.k} fill="var(--text-faint)" style={{ pointerEvents: 'none' }}>
                      {ZONE_TYPES[node.type].label} · peligro {node.danger}/5
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="mapview__hint">Arrastra para mover · rueda para acercar</div>
        <div className="mapview__zoom">
          <button className="btn btn--icon btn--sm" onClick={() => setView((v) => ({ ...v, k: Math.min(2.4, v.k * 1.2) }))} aria-label="Acercar">+</button>
          <button className="btn btn--icon btn--sm" onClick={() => setView((v) => ({ ...v, k: Math.max(0.35, v.k / 1.2) }))} aria-label="Alejar">−</button>
        </div>
      </div>

      <div style={{ padding: '11px 18px', borderTop: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(ZONE_TYPES) as ZoneType[]).filter((t) => t !== 'unknown').map((t) => (
          <span key={t} className="chip">
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: `oklch(60% 0.1 ${TYPE_HUE[t]} / 0.85)` }} />
            {ZONE_TYPES[t].label}
          </span>
        ))}
        <span className="chip" style={{ borderColor: 'var(--accent)' }}>Estás aquí</span>
        <span className="chip" style={{ borderColor: 'var(--ok)' }}>🏚️ Refugio</span>
      </div>
    </Modal>
  );
}
