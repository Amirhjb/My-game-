import { GENRES } from './data/genres';
import type { GenreId } from './engine/types';

/** Aplica la piel visual del género: todo el sistema de color deriva de aquí. */
export function applyTheme(genre: GenreId | null): void {
  const def = GENRES[genre ?? 'apocalypse'];
  const root = document.documentElement;
  root.style.setProperty('--h', String(def.hue));
  root.style.setProperty('--c', String(def.chroma));
}
