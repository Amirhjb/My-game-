import { WEATHER } from '../data/conditions';
import { getItem } from '../data/items';
import { currentNode, isSheltered } from './world';
import { isNight } from './rules';
import type { GameState } from './types';

export interface SuggestionGroup {
  label: string;
  tone: 'normal' | 'warn' | 'bad';
  actions: { icon: string; text: string }[];
}

/**
 * Acciones rápidas contextuales. Si el narrador ha propuesto sugerencias
 * propias para la escena, tienen prioridad: son más específicas.
 */
export function suggestActions(state: GameState, fromNarrator: string[]): SuggestionGroup {
  if (fromNarrator.length >= 2) {
    return {
      label: 'En esta escena',
      tone: 'normal',
      actions: fromNarrator.slice(0, 4).map((text) => ({ icon: '›', text })),
    };
  }

  const node = currentNode(state.map);
  const danger = node?.danger ?? 1;
  const sheltered = isSheltered(state.map);
  const weather = WEATHER[state.weather.id];
  const { hunger, thirst, sleep } = state.needs;

  const cat = state.customItems;
  const hasFood = state.inventory.some((s) => getItem(s.name, cat).tags.includes('food'));
  const hasWater = state.inventory.some((s) => getItem(s.name, cat).tags.includes('water'));
  const hasMeds = state.inventory.some((s) => getItem(s.name, cat).tags.includes('medical'));
  const atBase = state.base.established && state.map.currentZone === state.base.location;

  // 1. Algo te está matando ahora mismo.
  if (hunger < 18 || thirst < 18 || sleep < 15) {
    const actions: SuggestionGroup['actions'] = [];
    if (thirst < 18) actions.push(hasWater
      ? { icon: '💧', text: 'Bebo agua de lo que llevo encima' }
      : { icon: '💧', text: 'Busco agua potable con urgencia' });
    if (hunger < 18) actions.push(hasFood
      ? { icon: '🍖', text: 'Como algo de mi mochila' }
      : { icon: '🍖', text: 'Busco comida donde sea' });
    if (sleep < 15) actions.push({ icon: '😴', text: 'Busco un sitio seguro y duermo' });
    actions.push({ icon: '🔍', text: 'Registro la zona buscando suministros' });
    return { label: 'Necesidad crítica', tone: 'bad', actions: actions.slice(0, 4) };
  }

  // 2. Salud comprometida.
  if (state.hp < state.maxHp * 0.4 || state.injuries.some((i) => i.severity >= 2) || state.diseases.some((d) => d.stage >= 1)) {
    return {
      label: 'Estás mal herido',
      tone: 'bad',
      actions: [
        hasMeds
          ? { icon: '💊', text: 'Me trato las heridas con lo que tengo' }
          : { icon: '🔍', text: 'Busco material médico o algo que sirva' },
        { icon: '🏚️', text: 'Busco un sitio defendible donde recuperarme' },
        { icon: '😴', text: 'Descanso unas horas antes de seguir' },
        { icon: '🚶', text: 'Me alejo despacio de aquí' },
      ],
    };
  }

  // 3. Clima peligroso a la intemperie.
  if (weather.severe && !sheltered) {
    return {
      label: weather.label,
      tone: 'warn',
      actions: [
        { icon: '🚪', text: 'Entro en el edificio más cercano' },
        { icon: '🕳️', text: 'Busco un sótano o algo bajo tierra' },
        { icon: '⏳', text: 'Me resguardo y espero a que amaine' },
        { icon: '🏃', text: 'Corro hacia la zona conocida más próxima' },
      ],
    };
  }

  // 4. Zona hostil.
  if (danger >= 3) {
    return {
      label: 'Zona peligrosa',
      tone: 'warn',
      actions: [
        { icon: '👣', text: 'Avanzo pegado a las sombras, sin hacer ruido' },
        { icon: '👁️', text: 'Observo desde cubierto antes de moverme' },
        { icon: '🔍', text: 'Registro rápido y me largo' },
        { icon: '🏃', text: 'Me retiro hacia terreno más seguro' },
      ],
    };
  }

  // 5. En el refugio.
  if (atBase) {
    return {
      label: 'En tu refugio',
      tone: 'normal',
      actions: [
        { icon: '😴', text: 'Duermo hasta que amanezca' },
        { icon: '🔧', text: 'Reviso y reparo mi equipo' },
        { icon: '🌱', text: 'Me ocupo del refugio y sus alrededores' },
        { icon: '🗺️', text: 'Planeo la próxima salida' },
      ],
    };
  }

  // 6. De noche, fuera.
  if (isNight(state.minutes) && !sheltered) {
    return {
      label: 'Es de noche',
      tone: 'warn',
      actions: [
        { icon: '🔦', text: 'Busco dónde pasar la noche a cubierto' },
        { icon: '🔥', text: 'Hago fuego y monto un campamento' },
        { icon: '👣', text: 'Sigo avanzando aprovechando la oscuridad' },
        { icon: '👂', text: 'Me quedo quieto y escucho' },
      ],
    };
  }

  // 7. Exploración tranquila.
  return {
    label: 'Exploración',
    tone: 'normal',
    actions: [
      { icon: '🔍', text: 'Registro los alrededores en busca de recursos' },
      { icon: '🗺️', text: 'Avanzo hacia una zona que no conozco' },
      { icon: '💧', text: 'Busco agua y comida' },
      { icon: '🏚️', text: 'Busco un sitio donde poder asentarme' },
    ],
  };
}
