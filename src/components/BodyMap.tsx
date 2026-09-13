import { INJURY_ZONES, SEVERITY_LABEL } from '../data/skills';
import type { Injury, InjuryZone } from '../engine/types';

/** Silueta con las zonas coloreadas según la gravedad de cada lesión. */
const SHAPES: Record<InjuryZone, { d?: string; cx?: number; cy?: number; rx?: number; ry?: number }> = {
  cabeza:     { cx: 50, cy: 13, rx: 9, ry: 10.5 },
  torso:      { d: 'M38 26 h24 l3 26 -4 12 h-22 l-4 -12 z' },
  brazo_izq:  { d: 'M30 27 l6 2 -3 26 -6 -2 z' },
  brazo_der:  { d: 'M70 27 l-6 2 3 26 6 -2 z' },
  pierna_izq: { d: 'M40 65 h9 l-1 28 -8 1 z' },
  pierna_der: { d: 'M60 65 h-9 l1 28 8 1 z' },
};

export function BodyMap({ injuries }: { injuries: Injury[] }) {
  const byZone = new Map(injuries.map((i) => [i.zone, i]));
  return (
    <div>
      <svg className="bodymap" viewBox="0 0 100 100" role="img" aria-label="Estado físico por zonas del cuerpo">
        {(Object.keys(SHAPES) as InjuryZone[]).map((zone) => {
          const inj = byZone.get(zone);
          const shape = SHAPES[zone];
          const title = inj
            ? `${INJURY_ZONES[zone].label}: ${SEVERITY_LABEL[inj.severity]} — ${inj.label}`
            : `${INJURY_ZONES[zone].label}: sin daño`;
          const props = { className: 'bodymap__part', 'data-sev': inj?.severity ?? 0 };
          return shape.d ? (
            <path key={zone} d={shape.d} {...props}><title>{title}</title></path>
          ) : (
            <ellipse key={zone} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...props}><title>{title}</title></ellipse>
          );
        })}
      </svg>
      {injuries.length > 0 && (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 10 }}>
          {injuries.map((i) => (
            <li key={i.zone} style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontSize: 11.5 }}>
              <span
                aria-hidden
                style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: i.severity === 3 ? 'var(--bad)' : i.severity === 2 ? 'oklch(72% 0.17 50)' : 'var(--warn)',
                }}
              />
              <span style={{ color: 'var(--text-mid)', flex: 1 }}>
                <b style={{ fontWeight: 600 }}>{INJURY_ZONES[i.zone].label}</b>
                {' · '}
                <span style={{ color: 'var(--text-dim)' }}>{i.label}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
