import { useEffect, useRef, useState, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Medidor genérico
// ─────────────────────────────────────────────────────────────────────────────
export function Meter({
  label, icon, value, max = 100, suffix = '', color = 'var(--accent)', critAt = 20, warnAt = 40, decimals = 0,
}: {
  label: string; icon?: string; value: number; max?: number; suffix?: string;
  color?: string; critAt?: number; warnAt?: number; decimals?: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const state = pct <= critAt ? 'crit' : pct <= warnAt ? 'warn' : 'ok';
  const fill = state === 'crit' ? 'var(--bad)' : state === 'warn' ? 'var(--warn)' : color;
  return (
    <div className="meter" data-state={state}>
      <div className="meter__top">
        <span className="meter__label">{icon && <span aria-hidden>{icon}</span>}{label}</span>
        <span className="meter__value">{value.toFixed(decimals)}{suffix}</span>
      </div>
      <div className="meter__track" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className="meter__fill" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal accesible: foco atrapado, Escape cierra, scroll bloqueado
// ─────────────────────────────────────────────────────────────────────────────
export function Modal({
  title, icon, subtitle, onClose, children, footer, wide, tall, bodyless,
}: {
  title: string; icon?: string; subtitle?: ReactNode; onClose: () => void;
  children: ReactNode; footer?: ReactNode; wide?: boolean; tall?: boolean; bodyless?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(
        ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        className={`modal${wide ? ' modal--wide' : ''}${tall ? ' modal--tall' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal__head">
          <h2 className="modal__title">{icon && <span aria-hidden>{icon}</span>}{title}</h2>
          {subtitle && <div className="modal__sub">{subtitle}</div>}
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Cerrar" style={{ marginLeft: subtitle ? 0 : 'auto' }}>✕</button>
        </header>
        {bodyless ? children : <div className="modal__body">{children}</div>}
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Avisos flotantes
// ─────────────────────────────────────────────────────────────────────────────
export interface Toast { id: string; kind: 'info' | 'good' | 'bad' | 'warn'; text: string }

export function Toasts({ items, onDismiss }: { items: Toast[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind} role="status">
          <span aria-hidden>{t.kind === 'bad' ? '⚠' : t.kind === 'good' ? '✓' : t.kind === 'warn' ? '!' : 'ℹ'}</span>
          <span style={{ flex: 1 }}>{t.text}</span>
          <button className="btn btn--icon btn--ghost" style={{ width: 22, height: 22, padding: 0 }} onClick={() => onDismiss(t.id)} aria-label="Descartar">✕</button>
        </div>
      ))}
    </div>
  );
}

export function useToasts() {
  const [items, setItems] = useState<Toast[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  const push = (kind: Toast['kind'], text: string, ms = 5000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev.slice(-3), { id, kind, text }]);
    timers.current.push(window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, ms));
  };
  const dismiss = (id: string) => setItems((prev) => prev.filter((t) => t.id !== id));
  return { items, push, dismiss };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloque de panel lateral
// ─────────────────────────────────────────────────────────────────────────────
export function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="block">
      <div className="block__head">
        <h2 className="block__title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultas de medios (para saber si estamos en móvil)
// ─────────────────────────────────────────────────────────────────────────────
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confirmación en dos pasos, para acciones destructivas
// ─────────────────────────────────────────────────────────────────────────────
export function ConfirmButton({
  label, confirmLabel, onConfirm, className = 'btn btn--danger btn--sm',
}: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={className}
      onClick={() => { if (armed) { onConfirm(); setArmed(false); } else setArmed(true); }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
