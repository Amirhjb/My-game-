import { useMemo, useRef, useState } from 'react';
import { ARCHETYPES } from '../data/archetypes';
import { GENRE_LIST, GENRES } from '../data/genres';
import { NARRATOR_LIST } from '../data/conditions';
import { MAX_TRAITS, TRAITS, traitBalance } from '../data/traits';
import { allMeta, importSave, SLOT_LABEL } from '../persistence/saves';
import { HAS_BUILT_IN_KEY } from '../persistence/settings';
import type { GameApi } from '../hooks/useGame';
import type { GenreId, Screen } from '../engine/types';

const STEPS: { id: Screen; label: string }[] = [
  { id: 'genre', label: 'Mundo' },
  { id: 'archetype', label: 'Personaje' },
  { id: 'traits', label: 'Rasgos' },
  { id: 'narrator', label: 'Voz' },
];

function Steps({ current }: { current: Screen }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <nav className="setup__steps" aria-label="Progreso de creación">
      {STEPS.map((s, i) => (
        <span key={s.id} style={{ display: 'contents' }}>
          {i > 0 && <span className="setup__sep" aria-hidden />}
          <span className="setup__step" data-state={i < idx ? 'done' : i === idx ? 'current' : 'todo'}>
            {s.label}
          </span>
        </span>
      ))}
    </nav>
  );
}

function relativeTime(ts: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ts).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
export function Intro({ api, onSettings }: { api: GameApi; onSettings: () => void }) {
  const saves = useMemo(() => allMeta().sort((a, b) => b.savedAt - a.savedAt), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  return (
    <div className="setup setup--narrow setup--center">
      <div className="setup__inner">
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div className="u-eyebrow" style={{ marginBottom: 14 }}>Aventura narrativa generada por IA</div>
          <h1 className="title" style={{ fontSize: 'clamp(38px, 9vw, 62px)' }}>
            Último <em>Relato</em>
          </h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            Escribe lo que quieras hacer. El mundo responde, te pasa factura y recuerda.
            Cinco ambientaciones, un cuerpo que se rompe y un inventario que pesa.
          </p>
        </div>

        {saves.length > 0 && (
          <section style={{ marginBottom: 22 }}>
            <div className="u-eyebrow" style={{ marginBottom: 10 }}>Continuar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {saves.map((s) => (
                <button key={s.slot} className="pick" onClick={() => api.loadSlot(s.slot)}>
                  <div className="pick__title" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {s.genre ? GENRES[s.genre].emoji : '☢'} {s.charName}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>
                      {SLOT_LABEL[s.slot]}
                    </span>
                  </div>
                  <div className="pick__desc">
                    Día {s.day} · {s.location} · {Math.round(s.hp)}/{s.maxHp} de vida · {s.actions} acciones
                    <br />
                    <span style={{ color: 'var(--text-faint)' }}>Guardado {relativeTime(s.savedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {!api.ready && (
          <div className="notice notice--info" style={{ marginBottom: 18 }}>
            <span aria-hidden>🔑</span>
            <div>
              <b>Antes de jugar hace falta una clave de API.</b> El juego necesita un modelo de
              lenguaje para narrar. Groq y Gemini tienen capa gratuita y se configuran en menos
              de un minuto; sin eso la partida no puede arrancar.
              <div style={{ marginTop: 9 }}>
                <button className="btn btn--sm" onClick={onSettings}>Configurar ahora</button>
              </div>
            </div>
          </div>
        )}
        {api.ready && HAS_BUILT_IN_KEY && (
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center', marginBottom: 14 }}>
            Clave integrada en esta compilación. Puedes cambiarla en Ajustes.
          </p>
        )}

        <button
          className="btn btn--primary btn--lg btn--block"
          onClick={() => (api.ready ? api.dispatch({ type: 'setScreen', screen: 'genre' }) : onSettings())}
        >
          {api.ready ? 'Nueva partida' : 'Configurar la IA y empezar'}
        </button>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={onSettings}>⚙ Ajustes</button>
          <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => fileRef.current?.click()}>
            ⬆ Importar partida
          </button>
          <input
            ref={fileRef} type="file" accept="application/json,.json" className="u-sr"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const loaded = await importSave(file);
              if (loaded) { setImportError(null); api.loadState(loaded); }
              else setImportError('Ese fichero no es una partida válida de Último Relato.');
            }}
          />
        </div>
        {importError && <div className="notice" style={{ marginTop: 12 }}><span aria-hidden>⚠</span>{importError}</div>}

        <p style={{ marginTop: 26, fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.6 }}>
          La clave solo sale de aquí para hablar con el proveedor que elijas.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function GenrePick({ api }: { api: GameApi }) {
  const { state, dispatch } = api;
  return (
    <div className="setup">
      <div className="setup__inner">
        <Steps current="genre" />
        <h1 className="title">¿Dónde transcurre?</h1>
        <p className="subtitle">
          La ambientación cambia el mundo entero: el tono, las amenazas, el clima, tu equipo y hasta la paleta de la interfaz.
        </p>
        <div className="grid grid--2">
          {GENRE_LIST.map((g) => (
            <button
              key={g.id}
              className="pick"
              aria-pressed={state.genre === g.id}
              onClick={() => dispatch({ type: 'setGenre', genre: g.id as GenreId })}
              // Cada tarjeta enseña su propio acento. `--accent` se resuelve donde se
              // declara, así que hay que redeclararlo aquí y no solo cambiar `--h`.
              style={{
                ['--accent' as string]: `oklch(78% ${g.chroma} ${g.hue})`,
                ['--accent-soft' as string]: `oklch(78% ${g.chroma} ${g.hue} / 0.16)`,
                ['--accent-line' as string]: `oklch(78% ${g.chroma} ${g.hue} / 0.4)`,
              }}
            >
              <span className="pick__title">
                <span aria-hidden style={{ fontSize: 20 }}>{g.emoji}</span>
                {g.label}
              </span>
              <span className="pick__desc" style={{ color: 'var(--accent)', fontStyle: 'italic' }}>{g.tagline}</span>
              <span className="pick__desc">{g.premise.split('. ').slice(0, 2).join('. ')}.</span>
            </button>
          ))}
        </div>
        <div className="setup__actions">
          <button className="btn" onClick={() => dispatch({ type: 'setScreen', screen: 'intro' })}>← Atrás</button>
          <button
            className="btn btn--primary"
            disabled={!state.genre}
            onClick={() => dispatch({ type: 'setScreen', screen: 'archetype' })}
          >
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function ArchetypePick({ api }: { api: GameApi }) {
  const { state, dispatch } = api;
  const genre = state.genre ?? 'apocalypse';
  const ready = Boolean(state.archetypeId) && state.charName.trim().length > 0;

  return (
    <div className="setup">
      <div className="setup__inner">
        <Steps current="archetype" />
        <h1 className="title">¿Quién eres?</h1>
        <p className="subtitle">
          Tu oficio define habilidades iniciales, el equipo con el que empiezas y las recetas que ya sabes.
        </p>

        <div style={{ maxWidth: 400, margin: '0 auto 26px' }}>
          <label className="u-eyebrow" htmlFor="charname" style={{ display: 'block', marginBottom: 7 }}>
            Nombre del personaje
          </label>
          <input
            id="charname"
            className="field"
            placeholder="¿Cómo te llamas?"
            value={state.charName}
            maxLength={32}
            onChange={(e) => dispatch({ type: 'setName', name: e.target.value })}
          />
        </div>

        <div className="grid grid--wide">
          {ARCHETYPES.map((a) => {
            const skin = a.skins[genre];
            const selected = state.archetypeId === a.id;
            return (
              <button key={a.id} className="pick" aria-pressed={selected} onClick={() => dispatch({ type: 'setArchetype', id: a.id })}>
                <span className="pick__title">
                  <span aria-hidden style={{ fontSize: 18 }}>{a.icon}</span>
                  {skin.label}
                </span>
                <span className="pick__desc">{skin.desc}</span>
                <span className="pick__tags">
                  {Object.entries(a.bonuses).map(([k, v]) => (
                    <span key={k} className="chip chip--pos">+{v} {k}</span>
                  ))}
                  {Object.entries(a.penalties).map(([k, v]) => (
                    <span key={k} className="chip chip--neg">{v} {k}</span>
                  ))}
                </span>
                <span className="pick__desc" style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>
                  🎒 {a.items.slice(0, 4).join(', ')}…
                </span>
              </button>
            );
          })}
        </div>

        <div className="setup__actions">
          <button className="btn" onClick={() => dispatch({ type: 'setScreen', screen: 'genre' })}>← Atrás</button>
          <button className="btn btn--primary" disabled={!ready} onClick={() => dispatch({ type: 'setScreen', screen: 'traits' })}>
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function TraitsPick({ api }: { api: GameApi }) {
  const { state, dispatch } = api;
  const balance = traitBalance(state.traits);
  const valid = balance >= 0;
  const full = state.traits.length >= MAX_TRAITS;

  const render = (type: 'pos' | 'neg') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div className="u-eyebrow" style={{ color: type === 'pos' ? 'var(--ok)' : 'var(--bad)' }}>
        {type === 'pos' ? 'Ventajas — cuestan puntos' : 'Lastres — dan puntos'}
      </div>
      {TRAITS.filter((t) => t.type === type).map((t) => {
        const on = state.traits.includes(t.id);
        return (
          <button
            key={t.id}
            className="pick"
            aria-pressed={on}
            disabled={!on && full}
            style={{ padding: '10px 13px', gap: 3 }}
            onClick={() => dispatch({ type: 'toggleTrait', id: t.id, max: MAX_TRAITS })}
          >
            <span className="pick__title" style={{ fontSize: 13.5, justifyContent: 'space-between', paddingRight: on ? 20 : 0 }}>
              {t.label}
              <span className="u-num" style={{ color: t.cost < 0 ? 'var(--bad)' : 'var(--ok)', fontSize: 12 }}>
                {t.cost > 0 ? `+${t.cost}` : t.cost}
              </span>
            </span>
            <span className="pick__desc" style={{ fontSize: 12 }}>{t.desc}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="setup">
      <div className="setup__inner">
        <Steps current="traits" />
        <h1 className="title">Virtudes y lastres</h1>
        <p className="subtitle">
          Para llevarte una ventaja tienes que aceptar un defecto que la pague. Máximo {MAX_TRAITS} rasgos.
        </p>

        <div className="points">
          <span className="points__num" style={{ color: valid ? 'var(--ok)' : 'var(--bad)' }}>
            {balance > 0 ? `+${balance}` : balance}
          </span>
          <span className="points__body">
            {valid
              ? state.traits.length
                ? 'Ficha válida. Puedes seguir así o gastar los puntos que te sobren.'
                : 'Puedes empezar sin ningún rasgo si lo prefieres.'
              : 'Te faltan puntos: añade algún lastre o quita una ventaja.'}
            <br />
            <span style={{ color: 'var(--text-faint)' }}>{state.traits.length} de {MAX_TRAITS} rasgos elegidos</span>
          </span>
        </div>

        <div className="grid grid--2" style={{ alignItems: 'start' }}>
          {render('pos')}
          {render('neg')}
        </div>

        <div className="setup__actions">
          <button className="btn" onClick={() => dispatch({ type: 'setScreen', screen: 'archetype' })}>← Atrás</button>
          <button className="btn btn--primary" disabled={!valid} onClick={() => dispatch({ type: 'setScreen', screen: 'narrator' })}>
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function NarratorPick({ api, onSettings }: { api: GameApi; onSettings: () => void }) {
  const { state, dispatch, begin, ready } = api;
  return (
    <div className="setup">
      <div className="setup__inner">
        <Steps current="narrator" />
        <h1 className="title">¿Quién cuenta la historia?</h1>
        <p className="subtitle">
          La voz del narrador no cambia lo que ocurre, cambia cómo lo vives. Se puede cambiar en cualquier momento de la partida.
        </p>

        <div className="grid grid--2">
          {NARRATOR_LIST.map((n) => (
            <button key={n.id} className="pick" aria-pressed={state.narrator === n.id} onClick={() => dispatch({ type: 'setNarrator', id: n.id })}>
              <span className="pick__title">
                <span aria-hidden style={{ fontSize: 18 }}>{n.icon}</span>
                {n.label}
              </span>
              <span className="pick__desc" style={{ color: 'var(--accent)' }}>{n.tagline}</span>
              <span className="pick__desc" style={{ fontFamily: 'var(--font-prose)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.6 }}>
                «{n.preview}»
              </span>
            </button>
          ))}
        </div>

        {!ready && (
          <div className="notice notice--warn" style={{ marginTop: 20 }}>
            <span aria-hidden>🔑</span>
            <div>
              Aún no has configurado el proveedor de IA, así que la partida no podrá arrancar.
              <div style={{ marginTop: 8 }}><button className="btn btn--sm" onClick={onSettings}>Configurar</button></div>
            </div>
          </div>
        )}

        <div className="setup__actions">
          <button className="btn" onClick={() => dispatch({ type: 'setScreen', screen: 'traits' })}>← Atrás</button>
          <button className="btn btn--primary" disabled={!ready} onClick={begin}>Empezar la historia</button>
        </div>
      </div>
    </div>
  );
}
