import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ZONE_TYPES } from '../engine/world';
import { Modal } from '../components/ui';
import type { GameState, ZoneType } from '../engine/types';

const TYPE_HUE: Record<ZoneType, number> = {
  urban: 42, wilderness: 150, indoor: 285, underground: 25, water: 220, unknown: 0,
};

const MIN_K = 0.18;
const MAX_K = 2.6;
/** Margen alrededor del contenido al encuadrar, en píxeles de pantalla. */
const PAD = 64;

interface View { x: number; y: number; k: number }

/** Nombres largos cortados: el completo sigue disponible al pasar por encima. */
function shorten(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

export function MapModal({ state, onClose, onTravel }: {
  state: GameState; onClose: () => void; onTravel?: (zona: string) => void;
}) {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const boxRef = useRef<HTMLDivElement>(null);

  const nodes = useMemo(() => Object.entries(state.map.nodes), [state.map.nodes]);

  /** Caja que ocupa todo el mapa, en coordenadas del mundo. */
  const bounds = useMemo(() => {
    if (!nodes.length) return null;
    const xs = nodes.map(([, n]) => n.x);
    const ys = nodes.map(([, n]) => n.y);
    return {
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    };
  }, [nodes]);

  /**
   * Qué zona hay bajo un punto de la pantalla. Hace falta hacerlo a mano porque
   * la captura de puntero del contenedor —necesaria para arrastrar sin que se
   * corte— desvía el clic y nunca llega al círculo del nodo.
   */
  const nodeAt = useCallback((px: number, py: number): string | null => {
    const v = viewRef.current;
    const wx = px / v.k - v.x;
    const wy = py / v.k - v.y;
    // Radio generoso: en móvil se apunta con el pulgar.
    const radio = Math.max(18, 26 / v.k);
    let mejor: { name: string; d: number } | null = null;
    for (const [name, n] of nodes) {
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { name, d };
    }
    return mejor?.name ?? null;
  }, [nodes]);

  /** Encuadra el mapa entero dentro de la ventana. */
  const fitAll = useCallback(() => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !bounds || !box.width) return;
    const w = Math.max(1, bounds.maxX - bounds.minX);
    const h = Math.max(1, bounds.maxY - bounds.minY);
    const k = Math.max(MIN_K, Math.min(1.25, Math.min((box.width - PAD * 2) / w, (box.height - PAD * 2) / h)));
    setView({
      k,
      x: box.width / (2 * k) - (bounds.minX + bounds.maxX) / 2,
      y: box.height / (2 * k) - (bounds.minY + bounds.maxY) / 2,
    });
  }, [bounds]);

  /** Centra la vista en la zona actual sin cambiar el nivel de zoom. */
  const centerOnPlayer = useCallback(() => {
    const box = boxRef.current?.getBoundingClientRect();
    const here = state.map.nodes[state.map.currentZone];
    if (!box || !here) return;
    setView((v) => ({ ...v, x: box.width / (2 * v.k) - here.x, y: box.height / (2 * v.k) - here.y }));
  }, [state.map.nodes, state.map.currentZone]);

  // Al abrir, encuadrar todo. Después manda el jugador.
  useLayoutEffect(() => { fitAll(); }, [fitAll]);

  /**
   * Zoom anclado a un punto de la pantalla: lo que hay bajo el cursor se queda
   * donde está. Antes el zoom recalculaba solo `k` y el mapa se escapaba hacia
   * la esquina.
   */
  const zoomAt = useCallback((factor: number, screenX?: number, screenY?: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const px = screenX ?? box.width / 2;
    const py = screenY ?? box.height / 2;
    setView((v) => {
      const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      if (k === v.k) return v;
      // Punto del mundo bajo el cursor: se mantiene fijo al cambiar la escala.
      const worldX = px / v.k - v.x;
      const worldY = py / v.k - v.y;
      return { k, x: px / k - worldX, y: py / k - worldY };
    });
  }, []);

  // La rueda tiene que ir en un listener no pasivo o la página de detrás scrollea.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomAt(e.deltaY > 0 ? 0.88 : 1.14, e.clientX - box.left, e.clientY - box.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

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

  const visited = nodes.filter(([, n]) => n.visited).length;
  // Con el mapa muy alejado, tanta etiqueta no se lee: dejamos las importantes.
  const showAllLabels = view.k > 0.5;
  // Las vecinas directas se etiquetan siempre: son a donde puedes ir ahora.
  const vecinas = new Set(state.map.nodes[state.map.currentZone]?.connections ?? []);

  return (
    <Modal
      title="Mapa conocido"
      icon="🗺️"
      onClose={onClose}
      subtitle={<span>{visited} visitadas · {nodes.length} conocidas</span>}
      wide
      tall
      bodyless
    >
      <div
        ref={boxRef}
        className="mapview"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 3) return;
          d.moved = true;
          setView((v) => ({ ...v, x: d.vx + dx / v.k, y: d.vy + dy / v.k }));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
          if (!onTravel || !d || d.moved) return;
          const box = e.currentTarget.getBoundingClientRect();
          const zona = nodeAt(e.clientX - box.left, e.clientY - box.top);
          if (zona && zona !== state.map.currentZone) onTravel(zona);
        }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <svg width="100%" height="100%" role="img" aria-label={`Mapa con ${nodes.length} zonas conocidas`}>
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
              const r = (here ? 13 : node.visited ? 10 : 7) / view.k;
              const label = here || node.isBase || node.visited || vecinas.has(name) || showAllLabels;
              return (
                <g
                  key={name}
                  transform={`translate(${node.x} ${node.y})`}
                  onPointerEnter={() => setHover(name)}
                  onPointerLeave={() => setHover((h) => (h === name ? null : h))}
                >
                  {here && (
                    <circle r={r + 7 / view.k} fill="none" stroke="var(--accent)" strokeWidth={1.5 / view.k} opacity={0.5}>
                      <animate attributeName="r" values={`${r + 3 / view.k};${r + 11 / view.k};${r + 3 / view.k}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.55;0;0.55" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle
                    r={r}
                    fill={node.visited ? `oklch(60% 0.1 ${TYPE_HUE[node.type]} / 0.85)` : 'var(--surface-2)'}
                    stroke={here ? 'var(--accent)' : node.isBase ? 'var(--ok)' : 'var(--line-strong)'}
                    strokeWidth={(here || node.isBase ? 2.2 : 1) / view.k}
                    style={{ cursor: onTravel && !here ? 'pointer' : 'default' }}
                  >
                    <title>
                      {here
                        ? `${name} — estás aquí`
                        : node.visited
                          ? `${name} — ${ZONE_TYPES[node.type].label}, peligro ${node.danger}/5${node.isBase ? ' · tu refugio' : ''}. Pulsa para viajar.`
                          : `${name} — sin explorar. Pulsa para ir.`}
                    </title>
                  </circle>
                  {node.isBase && (
                    <text textAnchor="middle" y={4 / view.k} fontSize={13 / view.k} style={{ pointerEvents: 'none' }}>🏚️</text>
                  )}
                  {node.visited && !node.isBase && node.danger >= 4 && (
                    <text textAnchor="middle" y={4 / view.k} fontSize={12 / view.k} fill="var(--bad)" style={{ pointerEvents: 'none' }}>!</text>
                  )}
                  {(label || hover === name) && (
                    <text
                      textAnchor="middle" y={r + 14 / view.k} fontSize={11 / view.k}
                      fill={here ? 'var(--accent)' : node.visited ? 'var(--text-mid)' : 'var(--text-faint)'}
                      style={{ pointerEvents: 'none', fontWeight: here ? 600 : 400, paintOrder: 'stroke' }}
                      stroke="var(--bg-deep)" strokeWidth={3 / view.k} strokeLinejoin="round"
                    >
                      {hover === name ? name : shorten(name)}
                    </text>
                  )}
                  {hover === name && node.visited && (
                    <text
                      textAnchor="middle" y={r + 27 / view.k} fontSize={9.5 / view.k} fill="var(--text-faint)"
                      style={{ pointerEvents: 'none', paintOrder: 'stroke' }}
                      stroke="var(--bg-deep)" strokeWidth={3 / view.k} strokeLinejoin="round"
                    >
                      {ZONE_TYPES[node.type].label} · peligro {node.danger}/5
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="mapview__hint">
          {onTravel ? 'Pulsa una zona para viajar · arrastra para mover' : 'Arrastra para mover · rueda para acercar'}
        </div>
        <div className="mapview__zoom">
          <button className="btn btn--sm" onClick={fitAll} title="Ver el mapa entero">Ajustar</button>
          <button className="btn btn--sm" onClick={centerOnPlayer} title="Centrar en donde estás">Aquí</button>
          <button className="btn btn--icon btn--sm" onClick={() => zoomAt(1.25)} aria-label="Acercar">+</button>
          <button className="btn btn--icon btn--sm" onClick={() => zoomAt(0.8)} aria-label="Alejar">−</button>
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
        <span className="chip" style={{ color: 'var(--bad)' }}>! Peligro alto</span>
      </div>
    </Modal>
  );
}
