import { useState } from 'react';
import { NARRATOR_LIST } from '../data/conditions';
import { testConnection } from '../ai/client';
import { PROVIDERS, providerOf } from '../persistence/settings';
import { Modal } from '../components/ui';
import type { GameApi } from '../hooks/useGame';

type TestState = { kind: 'idle' | 'busy' | 'ok' | 'fail'; message?: string };

export function SettingsModal({ api, onClose }: { api: GameApi; onClose: () => void }) {
  const { settings, updateSettings, state, dispatch } = api;
  const preset = providerOf(settings.provider);
  const [showKey, setShowKey] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: 'idle' });

  const runTest = async () => {
    setTest({ kind: 'busy' });
    try {
      const reply = await testConnection(settings);
      setTest({ kind: 'ok', message: `Respuesta del modelo: «${reply.slice(0, 60)}»` });
    } catch (err) {
      setTest({ kind: 'fail', message: err instanceof Error ? err.message : 'Error desconocido.' });
    }
  };

  const section = { marginBottom: 26 };
  const label = { display: 'block', marginBottom: 7 } as const;

  return (
    <Modal title="Ajustes" icon="⚙" onClose={onClose} wide>
      <section style={section}>
        <h3 className="u-eyebrow" style={{ marginBottom: 12 }}>Proveedor de IA</h3>

        <div className="grid grid--3" style={{ marginBottom: 16 }}>
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className="pick"
              aria-pressed={settings.provider === p.id}
              style={{ padding: '11px 13px', gap: 4 }}
              onClick={() => {
                setTest({ kind: 'idle' });
                updateSettings({
                  provider: p.id,
                  baseUrl: p.baseUrl || settings.baseUrl,
                  model: p.models[0] ?? settings.model,
                });
              }}
            >
              <span className="pick__title" style={{ fontSize: 13.5 }}>{p.label}</span>
              <span className="pick__desc" style={{ fontSize: 11.5 }}>{p.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid grid--2" style={{ marginBottom: 14 }}>
          <div>
            <label className="u-eyebrow" style={label} htmlFor="baseurl">URL base</label>
            <input
              id="baseurl" className="field" spellCheck={false} autoComplete="off"
              placeholder="https://…/v1"
              value={settings.baseUrl}
              onChange={(e) => updateSettings({ baseUrl: e.target.value })}
            />
          </div>
          <div>
            <label className="u-eyebrow" style={label} htmlFor="model">Modelo</label>
            <input
              id="model" className="field" spellCheck={false} autoComplete="off" list="model-options"
              value={settings.model}
              onChange={(e) => updateSettings({ model: e.target.value })}
            />
            <datalist id="model-options">
              {preset.models.map((m) => <option key={m} value={m} />)}
            </datalist>
          </div>
        </div>

        {preset.needsKey && (
          <div style={{ marginBottom: 14 }}>
            <label className="u-eyebrow" style={label} htmlFor="apikey">Clave de API</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="apikey" className="field" style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                type={showKey ? 'text' : 'password'} spellCheck={false} autoComplete="off"
                placeholder="Pega aquí tu clave"
                value={settings.apiKey}
                onChange={(e) => { setTest({ kind: 'idle' }); updateSettings({ apiKey: e.target.value.trim() }); }}
              />
              <button className="btn" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}>
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            {preset.keyUrl && (
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 7, lineHeight: 1.5 }}>
                Consigue una clave gratis en{' '}
                <a href={preset.keyUrl} target="_blank" rel="noreferrer noopener">{new URL(preset.keyUrl).hostname}</a>.
                Se guarda solo en este navegador; nunca se envía a ningún sitio que no sea el proveedor que elijas.
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn--sm" onClick={runTest} disabled={test.kind === 'busy'}>
            {test.kind === 'busy' ? 'Probando…' : 'Probar conexión'}
          </button>
          {test.kind === 'ok' && <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ Funciona. {test.message}</span>}
          {test.kind === 'fail' && <span style={{ fontSize: 12, color: 'var(--bad)' }}>✕ {test.message}</span>}
        </div>
      </section>

      {state.screen === 'game' && (
        <section style={section}>
          <h3 className="u-eyebrow" style={{ marginBottom: 12 }}>Voz del narrador</h3>
          <div className="grid grid--3">
            {NARRATOR_LIST.map((n) => (
              <button
                key={n.id} className="pick" aria-pressed={state.narrator === n.id}
                style={{ padding: '11px 13px', gap: 3 }}
                onClick={() => dispatch({ type: 'setNarrator', id: n.id })}
              >
                <span className="pick__title" style={{ fontSize: 13 }}>
                  <span aria-hidden>{n.icon}</span>{n.label}
                </span>
                <span className="pick__desc" style={{ fontSize: 11.5 }}>{n.tagline}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="u-eyebrow" style={{ marginBottom: 12 }}>Experiencia</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {([
            ['images', 'Ilustrar escenas', 'Genera una imagen por escena con Pollinations (gratis, sin clave). Consume algo de datos.'],
            ['styleRewrite', 'Reescritura de estilo', 'Segunda llamada al modelo para aplicar la voz del narrador. Más carácter, el doble de peticiones.'],
            ['music', 'Ambiente sonoro', 'Sonido generado en tiempo real que sigue la tensión de la escena.'],
          ] as const).map(([key, title, desc]) => (
            <label key={key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => updateSettings({ [key]: e.target.checked })}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 550, display: 'block' }}>{title}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{desc}</span>
              </span>
            </label>
          ))}

          {settings.music && (
            <div>
              <label className="u-eyebrow" style={label} htmlFor="vol">Volumen del ambiente</label>
              <input
                id="vol" type="range" min={0} max={1} step={0.05}
                value={settings.volume}
                onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
            </div>
          )}
        </div>
      </section>
    </Modal>
  );
}
