import { WEATHER } from '../data/conditions';
import { getItem, itemCategory } from '../data/items';
import { skinItem } from '../data/genres';
import { clockOf, dayOf, partOfDay, pl } from '../engine/rules';
import { currentNode, ZONE_TYPES } from '../engine/world';
import { Block } from './ui';
import type { GameApi } from '../hooks/useGame';

/** Pesos pequeños en gramos: «0.0 kg» no le dice nada a nadie. */
export function formatWeight(kg: number): string {
  if (kg > 0 && kg < 0.1) return `${Math.round(kg * 1000)} g`;
  return `${kg.toFixed(kg < 1 ? 2 : 1)} kg`;
}

export function ContextRail({ api, onOpen }: { api: GameApi; onOpen: (id: string) => void }) {
  const { state, sceneUrl, status, settings, takePhoto } = api;
  const node = currentNode(state.map);
  const weather = WEATHER[state.weather.id];

  const cat = state.customItems;
  const grouped = [...state.inventory]
    .sort((a, b) => itemCategory(a.name, cat).order - itemCategory(b.name, cat).order || a.name.localeCompare(b.name))
    .slice(0, 9);

  return (
    <>
      <Block title="Escena">
        <div className="scene">
          {sceneUrl ? (
            <img src={sceneUrl} alt={state.sceneDescription || 'Ilustración de la escena actual'} />
          ) : (
            <div className="scene__empty">
              {!settings.images
                ? <>Imágenes desactivadas<br />en Ajustes</>
                : status === 'imaging'
                  ? <>Generando la escena…</>
                  : <>La ilustración aparecerá<br />cuando avance la historia</>}
            </div>
          )}
          <div className="scene__caption">
            <span aria-hidden>📍</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.location}
            </span>
          </div>
          {sceneUrl && (
            <button className="scene__shot" onClick={takePhoto} title="Guardar en el álbum" aria-label="Guardar esta escena en el álbum">
              📷
            </button>
          )}
        </div>
        {node && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <span className="chip">{ZONE_TYPES[node.type].icon} {ZONE_TYPES[node.type].label}</span>
            <span
              className="chip"
              style={node.danger >= 4
                ? { color: 'var(--bad)', borderColor: 'oklch(66% 0.19 25 / 0.4)' }
                : node.danger >= 3 ? { color: 'var(--warn)' } : undefined}
            >
              Peligro {node.danger}/5
            </span>
            {node.isBase && <span className="chip chip--accent">Refugio</span>}
          </div>
        )}
      </Block>

      <Block title="Entorno">
        <div className="weather">
          <div className="weather__now">
            <span className="weather__icon" aria-hidden>{weather.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div className="weather__name">{weather.label}</div>
              <div className="weather__desc">{weather.desc}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, fontSize: 11.5, color: 'var(--text-dim)' }}>
            <span>Día {dayOf(state.minutes)}</span>
            <span aria-hidden>·</span>
            <span className="u-num">{clockOf(state.minutes)}</span>
            <span aria-hidden>·</span>
            <span>{partOfDay(state.minutes)}</span>
          </div>
          {state.forecast.length > 0 && (
            <div className="weather__forecast" aria-label="Previsión de los próximos días">
              {state.forecast.map((id, i) => (
                <div key={i} className="weather__day" title={WEATHER[id].label}>
                  <span aria-hidden>{WEATHER[id].icon}</span>
                  +{i + 1}d
                </div>
              ))}
            </div>
          )}
        </div>
      </Block>

      <Block
        title="Mochila"
        action={
          <button className="btn btn--sm btn--ghost" onClick={() => onOpen('inventory')}>
            {pl(state.inventory.length, 'objeto', 'objetos')} →
          </button>
        }
      >
        <div className="inv">
          {grouped.map((s) => {
            const def = getItem(s.name, cat);
            return (
              <div key={s.name} className="inv__row" style={{ cursor: 'default' }}>
                <span aria-hidden style={{ fontSize: 13 }}>{itemCategory(s.name, cat).icon}</span>
                <span className="inv__name" title={skinItem(s.name, state.genre)}>{skinItem(s.name, state.genre)}</span>
                {s.qty > 1 && <span className="inv__qty">×{s.qty}</span>}
                <span className="inv__weight">{formatWeight(def.kg * s.qty)}</span>
              </div>
            );
          })}
          {state.inventory.length === 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>No llevas nada encima.</p>
          )}
          {state.inventory.length > 9 && (
            <button className="btn btn--sm btn--ghost" style={{ marginTop: 6 }} onClick={() => onOpen('inventory')}>
              y {state.inventory.length - 9} más…
            </button>
          )}
        </div>
      </Block>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 10 }}>
        <button className="btn btn--sm" onClick={() => onOpen('base')}>
          🏚️ {state.base.established ? 'Refugio' : 'Fundar refugio'}
        </button>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', textAlign: 'center' }}>
          {pl(state.stats.actions, 'acción', 'acciones')} · {pl(state.stats.zonesDiscovered, 'zona', 'zonas')}
        </div>
      </div>
    </>
  );
}
