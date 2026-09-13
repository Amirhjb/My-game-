import { useEffect, useState } from 'react';
import { DISEASES } from '../data/conditions';
import { imageUrl } from '../persistence/imageStore';
import { Modal } from '../components/ui';
import type { GameState, Photo } from '../engine/types';

export function Diary({ state, onClose }: { state: GameState; onClose: () => void }) {
  return (
    <Modal
      title="Diario"
      icon="📓"
      onClose={onClose}
      subtitle={<span>{state.diary.length} entradas</span>}
    >
      {state.diary.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          Tu diario está en blanco. {state.charName} escribe cuando duerme o descansa varias horas seguidas:
          prueba a buscar un sitio seguro y dormir.
        </p>
      ) : (
        <div>
          {[...state.diary].reverse().map((e) => (
            <article key={e.id} className="diary-entry">
              <header className="diary-entry__head">
                <span className="diary-entry__day">Día {e.day}</span>
                <span className="u-num" style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{e.time}</span>
                <span className="chip">{e.location}</span>
                {e.mood && <span className="chip chip--accent">{e.mood}</span>}
              </header>
              <p className="diary-entry__text">{e.text}</p>
              <div style={{ display: 'flex', gap: 5, marginTop: 9, flexWrap: 'wrap' }}>
                <span className="chip" style={{ fontSize: 10 }}>❤ {e.hp}</span>
                <span className="chip" style={{ fontSize: 10 }}>🍖 {e.hunger}</span>
                <span className="chip" style={{ fontSize: 10 }}>💧 {e.thirst}</span>
                {e.diseases.map((d) => (
                  <span key={d} className="chip chip--neg" style={{ fontSize: 10 }}>
                    {DISEASES[d as keyof typeof DISEASES]?.label ?? d}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}

function PolaroidCard({ photo, index }: { photo: Photo; index: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    imageUrl(photo.imageKey).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [photo.imageKey]);

  const tilt = ((index * 37) % 7) - 3;
  return (
    <figure className="polaroid" style={{ transform: `rotate(${tilt}deg)` }}>
      {url
        ? <img src={url} alt={photo.caption} loading="lazy" />
        : <div style={{ aspectRatio: '4/3', background: 'oklch(30% 0 0)', display: 'grid', placeItems: 'center', color: 'oklch(60% 0 0)', fontSize: 11 }}>
            imagen no disponible
          </div>}
      <figcaption className="polaroid__caption">{photo.caption}</figcaption>
      <div className="polaroid__meta">
        <span>{photo.location}</span>
        <span>Día {photo.day} · {photo.time}</span>
      </div>
    </figure>
  );
}

export function Album({ state, onClose }: { state: GameState; onClose: () => void }) {
  return (
    <Modal
      title="Álbum"
      icon="📷"
      onClose={onClose}
      subtitle={<span>{state.photos.length} fotografías</span>}
      wide
    >
      {state.photos.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          Todavía no has guardado ninguna foto. Cuando la escena tenga ilustración, pulsa el botón 📷
          sobre ella para conservarla con un pie escrito por {state.charName}.
        </p>
      ) : (
        <div className="album">
          {[...state.photos].reverse().map((p, i) => <PolaroidCard key={p.id} photo={p} index={i} />)}
        </div>
      )}
    </Modal>
  );
}
