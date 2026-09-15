/**
 * Configuración del proveedor de IA.
 *
 * La clave puede venir de dos sitios:
 *  1. `.env.local` en la raíz del proyecto (VITE_API_KEY). Se compila dentro de
 *     `jugar.html`, así que la partida arranca sin tener que escribir nada.
 *     Ese fichero NO se sube al repositorio.
 *  2. Lo que el jugador escriba en Ajustes, que manda sobre lo anterior y vive
 *     en su localStorage.
 *
 * El repositorio es público: si la clave se commitea, GitHub la detecta y el
 * proveedor la revoca automáticamente. Por eso va por `.env.local`.
 */

/** Valores integrados en la compilación. Vacíos si no hay `.env.local`. */
const BUILT_IN = {
  apiKey: (import.meta.env.VITE_API_KEY ?? '').trim(),
  provider: (import.meta.env.VITE_API_PROVIDER ?? '').trim(),
  baseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').trim(),
  model: (import.meta.env.VITE_API_MODEL ?? '').trim(),
};

/** ¿La compilación trae clave propia? Lo usa la interfaz para no dar la lata. */
export const HAS_BUILT_IN_KEY = BUILT_IN.apiKey.length > 0;
export interface Settings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Generación de imágenes de escena (Pollinations, sin clave). */
  images: boolean;
  /** Segunda llamada para reescribir con la voz del narrador. */
  styleRewrite: boolean;
  music: boolean;
  volume: number;
  /** Reduce animaciones y efectos. */
  calm: boolean;
}

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  models: string[];
  needsKey: boolean;
  keyUrl?: string;
  hint: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'qwen/qwen3-32b'],
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    hint: 'Rápido y con una capa gratuita generosa. La opción recomendada para empezar.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    hint: 'Calidad narrativa alta. Es de pago por uso.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    // Google expone una capa compatible con OpenAI, así que sirve el mismo cliente.
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-pro'],
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    hint: 'Capa gratuita amplia y contexto muy largo. Buena prosa en español.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash-001'],
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    hint: 'Un solo sitio para muchos modelos, incluidos varios gratuitos.',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3.1', 'qwen2.5', 'mistral'],
    needsKey: false,
    hint: 'Todo se ejecuta en tu ordenador. Sin clave y sin coste, pero más lento.',
  },
  {
    id: 'custom',
    label: 'Otro (compatible con OpenAI)',
    baseUrl: '',
    models: [],
    needsKey: true,
    hint: 'Cualquier endpoint que exponga /chat/completions al estilo OpenAI.',
  },
];

const KEY = 'ultimo-relato:settings';

export const DEFAULT_SETTINGS: Settings = {
  provider: BUILT_IN.provider || 'groq',
  baseUrl: BUILT_IN.baseUrl || PROVIDERS[0].baseUrl,
  apiKey: BUILT_IN.apiKey,
  model: BUILT_IN.model || PROVIDERS[0].models[0],
  images: true,
  styleRewrite: true,
  music: false,
  volume: 0.35,
  calm: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const saved = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULT_SETTINGS, ...saved };
    // Si el jugador nunca puso clave propia, se usa la de la compilación.
    if (!saved.apiKey?.trim() && BUILT_IN.apiKey) merged.apiKey = BUILT_IN.apiKey;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* modo privado o almacenamiento lleno: la partida sigue funcionando */
  }
}

export function providerOf(id: string): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
}

export function isConfigured(s: Settings): boolean {
  if (!s.baseUrl.trim() || !s.model.trim()) return false;
  return providerOf(s.provider).needsKey ? s.apiKey.trim().length > 0 : true;
}
