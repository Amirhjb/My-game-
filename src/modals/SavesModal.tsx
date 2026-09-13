import { useRef, useState } from 'react';
import { archetypeName } from '../data/archetypes';
import { GENRES } from '../data/genres';
import {
  deleteSave, exportSave, importSave, readMeta, SLOTS, SLOT_LABEL, type SlotId,
} from '../persistence/saves';
import { ConfirmButton, Modal } from '../components/ui';
import type { GameApi } from '../hooks/useGame';

export function SavesModal({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const { state, saveNow, loadSlot, loadState } = api;
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);

  const inGame = state.screen === 'game' || state.screen === 'death';

  return (
    <Modal
      title="Partidas"
      icon="💾"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Importar fichero</button>
          {inGame && <button className="btn" onClick={() => exportSave(state)}>⬇ Exportar partida</button>}
        </>
      }
    >
      <p style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 18 }}>
        La ranura <b>Automático</b> se guarda sola después de cada acción. Las demás son copias manuales que
        puedes usar como puntos de retorno.
      </p>

      {note && <div className="notice notice--info" style={{ marginBottom: 16 }}><span aria-hidden>ℹ</span>{note}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SLOTS.map((slot: SlotId) => {
          const meta = readMeta(slot);
          return (
            <div key={slot} className="card" style={{ padding: 13, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{SLOT_LABEL[slot]}</div>
                {meta ? (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                    {meta.genre ? GENRES[meta.genre].emoji : '·'} {meta.charName} · {archetypeName(meta.archetypeId, meta.genre)}
                    <br />
                    Día {meta.day} · {meta.location} · {Math.round(meta.hp)}/{meta.maxHp} de vida
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Vacía</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {meta && (
                  <button className="btn btn--sm" onClick={() => { loadSlot(slot); onClose(); }}>Cargar</button>
                )}
                {inGame && slot !== 'auto' && (
                  <button
                    className="btn btn--sm"
                    onClick={() => {
                      const res = saveNow(slot);
                      setNote(res.ok ? `Partida guardada en ${SLOT_LABEL[slot]}.` : res.error ?? null);
                      refresh();
                    }}
                  >
                    Guardar aquí
                  </button>
                )}
                {meta && (
                  <ConfirmButton
                    label="Borrar"
                    confirmLabel="¿Seguro?"
                    onConfirm={() => { deleteSave(slot); setNote(`${SLOT_LABEL[slot]} borrada.`); refresh(); }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <input
        ref={fileRef} type="file" accept="application/json,.json" className="u-sr"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const loaded = await importSave(file);
          if (loaded) { loadState(loaded); onClose(); }
          else setNote('Ese fichero no es una partida válida.');
        }}
      />
    </Modal>
  );
}
