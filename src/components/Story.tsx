import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { suggestActions } from '../engine/suggestions';
import { dayOf } from '../engine/rules';
import type { GameApi, Status } from '../hooks/useGame';
import type { LogEntry } from '../engine/types';

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}|\n/).map((p, i) => p.trim() && <p key={i}>{p.trim()}</p>)}
    </>
  );
}

const NOTE_ICON: Record<string, string> = { good: '✓', bad: '✕', warn: '!', system: '·' };

function Entry({ entry }: { entry: LogEntry }) {
  if (entry.kind === 'story') {
    return <article className="entry entry--story"><Paragraphs text={entry.text} /></article>;
  }
  if (entry.kind === 'player') {
    return <div className="entry entry--player">{entry.text}</div>;
  }
  return (
    <div className="entry entry--note" data-kind={entry.kind}>
      <span aria-hidden>{NOTE_ICON[entry.kind] ?? '·'}</span>
      <span>{entry.text}</span>
    </div>
  );
}

export function Story({ api }: { api: GameApi }) {
  const { state, status, error, act, retry, cancel, clearError } = api;
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);

  // Solo autodesplazamos si el jugador ya estaba abajo: si está releyendo, no le movemos.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [state.log.length, status]);

  useEffect(() => {
    if (status === 'idle') inputRef.current?.focus();
  }, [status]);

  const busy = status === 'thinking';
  const group = suggestActions(state, api.suggestions);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    stickRef.current = true;
    act(text);
  };

  // Separadores de día, para que el registro largo siga siendo legible.
  const rendered: React.ReactNode[] = [];
  let lastDay = 0;
  for (const entry of state.log) {
    const day = dayOf(entry.at);
    if (day !== lastDay) {
      lastDay = day;
      rendered.push(<div key={`d${day}-${entry.id}`} className="day-sep">Día {day}</div>);
    }
    rendered.push(<Entry key={entry.id} entry={entry} />);
  }

  return (
    <div className="main">
      <div className="story" ref={scrollRef} onScroll={onScroll}>
        <div className="story__inner">
          {rendered}

          {busy && (
            <div className="thinking">
              <span className="thinking__dots" aria-hidden><i /><i /><i /></span>
              <span>El narrador está escribiendo…</span>
              <button className="btn btn--sm btn--ghost" onClick={cancel}>Cancelar</button>
            </div>
          )}

          {error && (
            <div className="notice" role="alert">
              <span aria-hidden>⚠</span>
              <div style={{ flex: 1 }}>
                {error}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn--sm" onClick={retry}>Reintentar</button>
                  <button className="btn btn--sm btn--ghost" onClick={clearError}>Descartar</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="compose">
        <div className="compose__inner">
          <div className="suggest">
            <div className="suggest__label">
              <span className="u-eyebrow" style={{ color: group.tone === 'bad' ? 'var(--bad)' : group.tone === 'warn' ? 'var(--warn)' : undefined }}>
                {group.label}
              </span>
            </div>
            <div className="suggest__list">
              {group.actions.map((a, i) => (
                <button
                  key={`${a.text}-${i}`}
                  className="suggest__btn"
                  disabled={busy}
                  onClick={() => { stickRef.current = true; act(a.text); }}
                >
                  <span aria-hidden>{a.icon}</span>{a.text}
                </button>
              ))}
            </div>
          </div>

          <div className="compose__row">
            <textarea
              ref={inputRef}
              className="field compose__input"
              placeholder={busy ? 'Esperando al narrador…' : '¿Qué haces?'}
              value={draft}
              rows={1}
              disabled={busy}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(150, e.target.scrollHeight)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
            />
            <button className="btn btn--primary" style={{ height: 46 }} disabled={busy || !draft.trim()} onClick={submit}>
              Actuar
            </button>
          </div>
          <div className="compose__hint">Intro para enviar · Mayús+Intro para salto de línea</div>
        </div>
      </div>
    </div>
  );
}

export type { Status };
