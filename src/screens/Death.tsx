import { useEffect, useState } from 'react';
import { archetypeName } from '../data/archetypes';
import { GENRES } from '../data/genres';
import { dayOf, pl } from '../engine/rules';
import { exportSave } from '../persistence/saves';
import { SavesModal } from '../modals/SavesModal';
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
  const [saves, setSaves] = useState(false);
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
          <Stat label={state.stats.daysSurvived === 1 ? 'Día' : 'Días'} value={state.stats.daysSurvived} />
          <Stat label={state.stats.actions === 1 ? 'Acción' : 'Acciones'} value={state.stats.actions} />
          <Stat label={state.stats.zonesDiscovered === 1 ? 'Zona' : 'Zonas'} value={state.stats.zonesDiscovered} />
          <Stat label={state.stats.itemsCrafted === 1 ? 'Fabricado' : 'Fabricados'} value={state.stats.itemsCrafted} />
          <Stat label={state.stats.levelsGained === 1 ? 'Nivel' : 'Niveles'} value={state.stats.levelsGained} />
          <Stat label={state.stats.photosTaken === 1 ? 'Foto' : 'Fotos'} value={state.stats.photosTaken} />
        </div>

        {(state.diary.length > 0 || state.photos.length > 0) && (
          <p style={{ fontSize: 12.5, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 22, lineHeight: 1.6 }}>
            Quedan {pl(state.diary.length, 'entrada', 'entradas')} de diario y {pl(state.photos.length, 'fotografía', 'fotografías')}.
            Exporta la partida si quieres conservarlas.
          </p>
        )}

        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={() => dispatch({ type: 'reset' })}
        >
          Empezar de nuevo
        </button>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" style={{ flex: 1, minWidth: 160 }} onClick={() => setSaves(true)}>
            💾 Cargar otra partida
          </button>
          <button className="btn btn--ghost" style={{ flex: 1, minWidth: 160 }} onClick={() => exportSave(state)}>
            ⬇ Exportar este relato
          </button>
        </div>
      </div>
      {saves && <SavesModal api={api} onClose={() => setSaves(false)} />}
    </div>
  );
}
