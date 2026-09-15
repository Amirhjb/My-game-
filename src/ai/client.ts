import { providerOf, type Settings } from '../persistence/settings';

export class AiError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'rate' | 'network' | 'server' | 'abort' | 'config' | 'empty') {
    super(message);
    this.name = 'AiError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Pide al proveedor que fuerce JSON, si lo soporta. */
  json?: boolean;
  timeoutMs?: number;
}

function friendly(status: number, body: string): AiError {
  const snippet = body.slice(0, 300);
  // Gemini devuelve 400 con «API key not valid» donde otros devuelven 401.
  const looksLikeBadKey = /api[_ ]?key|credential|unauthenticated|permission denied/i.test(body);
  if (status === 401 || status === 403 || (status === 400 && looksLikeBadKey)) {
    return new AiError('La clave de API no es válida o no tiene permisos. Revísala en Ajustes.', 'auth');
  }
  if (status === 429) {
    return new AiError('Has alcanzado el límite de peticiones del proveedor. Espera un momento y reintenta.', 'rate');
  }
  if (status === 404) {
    return new AiError(`El modelo o la URL no existen en este proveedor. Revísalos en Ajustes. (${snippet})`, 'config');
  }
  if (status >= 500) {
    return new AiError('El proveedor está fallando ahora mismo. Reintenta en unos segundos.', 'server');
  }
  return new AiError(`El proveedor ha rechazado la petición (${status}). ${snippet}`, 'server');
}

/** Una llamada de chat, compatible con cualquier endpoint estilo OpenAI. */
export async function chat(settings: Settings, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const preset = providerOf(settings.provider);
  const base = settings.baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new AiError('Falta la URL del proveedor. Configúrala en Ajustes.', 'config');
  if (preset.needsKey && !settings.apiKey.trim()) {
    throw new AiError('Falta la clave de API. Añádela en Ajustes.', 'config');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;

    const body: Record<string, unknown> = {
      model: settings.model,
      messages,
      temperature: opts.temperature ?? 0.9,
      max_tokens: opts.maxTokens ?? 1400,
      stream: false,
    };
    if (opts.json) body.response_format = { type: 'json_object' };

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Algunos modelos rechazan response_format; reintentamos sin él. No lo
      // hacemos si el 400 es en realidad una clave mal puesta.
      const badKey = /api[_ ]?key|credential|unauthenticated|permission denied/i.test(text);
      if (opts.json && !badKey && (res.status === 400 || res.status === 422)) {
        return chat(settings, messages, { ...opts, json: false });
      }
      throw friendly(res.status, text);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new AiError('El modelo ha devuelto una respuesta vacía.', 'empty');
    return content;
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AiError('La petición se ha cancelado o ha tardado demasiado.', 'abort');
    }
    throw new AiError(
      'No se ha podido contactar con el proveedor. Comprueba tu conexión y, si usas un servidor local, que esté arrancado y acepte peticiones del navegador (CORS).',
      'network',
    );
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** Comprobación rápida de configuración, para el botón "Probar conexión". */
export async function testConnection(settings: Settings): Promise<string> {
  const reply = await chat(
    settings,
    [{ role: 'user', content: 'Responde exactamente con la palabra: listo' }],
    { maxTokens: 12, temperature: 0, timeoutMs: 25_000 },
  );
  return reply;
}
