import { useState } from 'react';
import { DISEASES } from '../data/conditions';
import { SKILL_TREE, levelProgress } from '../data/skills';
import { skillView } from '../engine/rules';
import { capacityView } from '../engine/reducer';
import { Block, Meter } from './ui';
import { BodyMap } from './BodyMap';
import type { GameState } from '../engine/types';

/** La temperatura corporal no es una barra de 0 a 100: lo que importa es
 *  cuánto te has desviado de 36,5 °C y hacia qué lado. */
function Temperature({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, ((value - 32) / 10) * 100));
  const drift = value - 36.5;
  const note =
    drift <= -2.5 ? 'Hipotermia grave' : drift <= -1 ? 'Estás perdiendo calor'
    : drift >= 2.5 ? 'Hipertermia grave' : drift >= 1 ? 'Tienes fiebre o calor extremo'
    : 'Normal';
  const bad = Math.abs(drift) >= 2.5;
  return (
    <div>
      <div className="meter__top" style={{ marginBottom: 6 }}>
        <span className="meter__label"><span aria-hidden>🌡</span>Temperatura</span>
        <span className="temp__value" style={{ color: bad ? 'var(--bad)' : Math.abs(drift) >= 1 ? 'var(--warn)' : 'var(--text-mid)' }}>
          {value.toFixed(1)} °C
        </span>
      </div>
      <div className="temp">
        <div className="temp__scale" role="meter" aria-valuenow={value} aria-valuemin={32} aria-valuemax={42} aria-label="Temperatura corporal">
          <span className="temp__pin" style={{ left: `calc(${pct}% - 1px)` }} />
        </div>
      </div>
      <div className="temp__note" style={{ marginTop: 6, color: bad ? 'var(--bad)' : undefined }}>{note}</div>
    </div>
  );
}

export function StatusRail({ state }: { state: GameState }) {
  const [tab, setTab] = useState(0);
  const skills = skillView(state);
  const cap = capacityView(state);
  const hpPct = (state.hp / state.maxHp) * 100;

  return (
    <>
      <Block title="Constantes">
        <div className="vitals">
          <div className="vitals__hp">
            <b style={{ color: hpPct <= 25 ? 'var(--bad)' : hpPct <= 50 ? 'var(--warn)' : 'var(--text)' }}>
              {Math.round(state.hp)}
            </b>
            <span>/ {state.maxHp} vida</span>
          </div>
          <div className="meter__track" style={{ height: 5 }}>
            <div
              className="meter__fill"
              style={{
                width: `${Math.max(0, hpPct)}%`,
                background: hpPct <= 25 ? 'var(--bad)' : hpPct <= 50 ? 'var(--warn)' : 'var(--ok)',
              }}
            />
          </div>
          <Meter label="Hambre" icon="🍖" value={state.needs.hunger} critAt={20} warnAt={50} color="var(--ok)" />
          <Meter label="Sed" icon="💧" value={state.needs.thirst} critAt={20} warnAt={50} color="var(--ok)" />
          <Meter label="Sueño" icon="😴" value={state.needs.sleep} critAt={20} warnAt={50} color="var(--ok)" />
          <Temperature value={state.needs.temp} />
        </div>
      </Block>

      <Block title="Carga">
        <Meter
          label="Peso" value={cap.usedKg} max={cap.maxKg} suffix={` / ${cap.maxKg} kg`} decimals={1}
          critAt={0} warnAt={0} color={cap.usedKg > cap.maxKg ? 'var(--bad)' : 'var(--accent)'}
        />
        <Meter
          label="Volumen" value={cap.usedL} max={cap.maxL} suffix={` / ${cap.maxL} L`} decimals={1}
          critAt={0} warnAt={0} color={cap.usedL > cap.maxL ? 'var(--bad)' : 'var(--accent)'}
        />
        {cap.over && (
          <p style={{ fontSize: 11, color: 'var(--bad)', lineHeight: 1.45 }}>
            Vas sobrecargado. Suelta algo o guárdalo en el refugio.
          </p>
        )}
      </Block>

      <Block title="Estado físico">
        <BodyMap injuries={state.injuries} />
        {state.diseases.length > 0 && (
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
            {state.diseases.map((d) => {
              const def = DISEASES[d.id];
              const stage = def.stages[d.stage];
              return (
                <li
                  key={d.id}
                  style={{
                    padding: '8px 10px', borderRadius: 'var(--r-sm)',
                    background: `oklch(70% 0.14 ${def.hue} / 0.12)`,
                    border: `1px solid oklch(70% 0.14 ${def.hue} / 0.3)`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
                    <span aria-hidden>{def.icon}</span>
                    <span style={{ flex: 1 }}>{def.label}</span>
                    <span className="chip" style={{ fontSize: 9.5, padding: '1px 6px' }}>{stage.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, lineHeight: 1.4 }}>{stage.desc}</div>
                </li>
              );
            })}
          </ul>
        )}
        {state.modifiers.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {state.modifiers.map((m) => (
              <span key={m.id} className="chip chip--neg" title={`Quedan ${m.turns} turnos`}>
                {m.label} · {m.turns}
              </span>
            ))}
          </div>
        )}
        {!state.injuries.length && !state.diseases.length && !state.modifiers.length && (
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>Sin lesiones ni enfermedades.</p>
        )}
      </Block>

      <Block title="Habilidades">
        <div className="tabs" role="tablist">
          {SKILL_TREE.map((cat, i) => (
            <button
              key={cat.id} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
              title={cat.label}
            >
              <span aria-hidden>{cat.icon}</span>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: -3 }}>{SKILL_TREE[tab].label}</div>
        <div className="skills">
          {SKILL_TREE[tab].skills.map((name) => {
            const v = skills[name];
            return (
              <div key={name} className="skill">
                <span className="skill__name">{name}</span>
                <span className="skill__lvl">
                  <b>{v.level}</b>
                  {v.penalty > 0 && <span className="skill__pen"> ({v.base}−{v.penalty})</span>}
                </span>
                <span className="skill__track">
                  <span className="skill__fill" style={{ width: `${levelProgress(v.xp) * 100}%` }} />
                </span>
              </div>
            );
          })}
        </div>
      </Block>
    </>
  );
}
