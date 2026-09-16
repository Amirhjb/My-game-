import { GENRES } from '../data/genres';
import { putImage, imageUrl } from '../persistence/imageStore';
import type { GenreId } from '../engine/types';

/** Hash numérico estable del texto. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Clave estable y corta para guardar la imagen. */
function hashKey(input: string): string {
  return `img_${hash32(input).toString(36)}_${input.length.toString(36)}`;
}

export function scenePrompt(description: string, genre: GenreId | null): string {
  const style = GENRES[genre ?? 'apocalypse'].imageStyle;
  return `${description}, ${style}`;
}

const inflight = new Map<string, Promise<string | null>>();

/**
 * Descarga la imagen de escena y la guarda en IndexedDB.
 * Devuelve la clave (no la imagen) para que el estado siga siendo ligero.
 */
export async function fetchSceneImage(
  description: string, genre: GenreId | null, signal?: AbortSignal,
): Promise<string | null> {
  const desc = description.trim();
  if (!desc) return null;
  const prompt = scenePrompt(desc, genre);
  const key = hashKey(prompt);

  // Si ya está en disco, no volvemos a pedirla.
  if (await imageUrl(key)) return key;
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const url =
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        // La semilla salía de la LONGITUD de la clave, que solo variaba entre 12 y
        // 14 caracteres: escenas distintas compartían ilustración. Ahora usa el
        // hash numérico completo.
        `?width=768&height=448&nologo=true&model=flux&seed=${hash32(prompt) % 99999}`;
      const res = await fetch(url, { signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/') || blob.size < 1024) return null;
      await putImage(key, blob);
      return key;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export { imageUrl };
