import { useEffect, useState } from 'react';
import { archetypeName } from '../data/archetypes';
import { GENRES } from '../data/genres';
import { dayOf } from '../engine/rules';
import { exportSave } from '../persistence/saves';
import type { GameApi } from '../hooks/useGame';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="u-num" style={{ fontSize: 26, lineHeight: 1.2, color: 'var(--accent)' }}>{value}</div>
      <div className="u-eyebrow" style={{ marginTop: 3 }}>{label}</div>
    </div>
  );
}

export function Death({ api }: { api: GameApi }) {
  const { state, dispatch } = api;
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 400); return () => clearTimeout(t); }, []);

  const lastWords = [...state.log].reverse().find((e) => e.kind === 'story');
  const genre = GENRES[state.genre ?? 'apocalypse'];

  return (
    <div className="setup setup--narrow setup--center">
      <div className="setup__inner" style={{ opacity: visible ? 1 : 0, transition: 'opacity 800ms var(--ease)' }}>
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <div className="u-eyebrow" style={{ marginBottom: 12 }}>{genre.label}</div>
          <h1 className="title">Aquí termina</h1>
          <p className="subtitle" style={{ marginBottom: 18 }}>
            {state.charName}, {archetypeName(state.archetypeId, state.genre).toLowerCase()}, no llegó al día{' '}
            {dayOf(state.minutes) + 1}.
          </p>
          <div className="chip chip--neg" style={{ fontSize: 13, padding: '6px 14px' }}>
            {state.deathCause ?? 'Causa desconocida'}
          </div>
        </div>

        {lastWords && (
          <blockquote
            className="card"
            style={{
              padding: '18px 20px', marginBottom: 26,
              fontFamily: 'var(--font-prose)', fontSize: 16, lineHeight: 1.75,
              fontStyle: 'italic', color: 'var(--text-mid)',
            }}
          >
            {lastWords.text.split('\n').slice(-2).join(' ').slice(0, 420)}
          </blockquote>
        )}

        <div
          className="card"
          style={{ padding: 20, marginBottom: 26, display: 'grid', gap: 18, gridTemplateColumns: 'repeat(3, 1fr)' }}
        >
          <Stat label="Días" value={state.stats.daysSurvived} />
          <Stat label="Acciones" value={state.stats.actions} />
          <Stat label="Zonas" value={state.stats.zonesDiscovered} />
          <Stat label="Fabricados" value={state.stats.itemsCrafted} />
          <Stat label="Niveles" value={state.stats.levelsGained} />
          <Stat label="Fotos" value={state.stats.photosTaken} />
        </div>

        {(state.diary.length > 0 || state.photos.length > 0) && (
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 22, lineHeight: 1.6 }}>
            Quedan {state.diary.length} entrada(s) de diario y {state.photos.length} fotografía(s).
            Exporta la partida si quieres conservarlas.
          </p>
        )}

        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={() => dispatch({ type: 'reset' })}
        >
          Empezar de nuevo
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => exportSave(state)}>
            ⬇ Exportar este relato
          </button>
        </div>
      </div>
    </div>
  );
}
