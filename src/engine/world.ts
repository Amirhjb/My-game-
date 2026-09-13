import { GENRES } from '../data/genres';
import { WEATHER } from '../data/conditions';
import { getItem } from '../data/items';
import { clamp } from './rules';
import type {
  GameState, GenreId, MapState, Mood, Stack, WeatherId, WeatherState, ZoneNode, ZoneType,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Clima
// ─────────────────────────────────────────────────────────────────────────────
export function rollWeather(genre: GenreId, rng: () => number): WeatherState {
  const table = GENRES[genre].weather;
  const entries = Object.entries(table) as [WeatherId, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  let id: WeatherId = 'clear';
  for (const [wid, w] of entries) {
    if (r < w) { id = wid; break; }
    r -= w;
  }
  const days = WEATHER[id].days;
  return { id, daysLeft: days[Math.floor(rng() * days.length)] ?? 1 };
}

/** Previsión coherente: expande la duración de cada evento a días concretos. */
export function buildForecast(current: WeatherState, genre: GenreId, rng: () => number): WeatherId[] {
  const out: WeatherId[] = [];
  for (let d = 1; d < current.daysLeft && out.length < 5; d++) out.push(current.id);
  while (out.length < 5) {
    const next = rollWeather(genre, rng);
    for (let d = 0; d < next.daysLeft && out.length < 5; d++) out.push(next.id);
  }
  return out.slice(0, 5);
}

export interface WeatherAdvance {
  weather: WeatherState;
  forecast: WeatherId[];
  accum: number;
  changed: boolean;
}

export function advanceWeather(
  state: Pick<GameState, 'weather' | 'forecast' | 'weatherAccum'>,
  minutes: number, genre: GenreId, rng: () => number,
): WeatherAdvance {
  let accum = state.weatherAccum + minutes;
  const days = Math.floor(accum / 1440);
  accum %= 1440;
  if (days === 0) return { weather: state.weather, forecast: state.forecast, accum, changed: false };

  let weather = { ...state.weather };
  let forecast = [...state.forecast];
  let changed = false;
  for (let i = 0; i < days; i++) {
    if (weather.daysLeft > 1) {
      weather = { ...weather, daysLeft: weather.daysLeft - 1 };
    } else {
      const nextId = forecast.shift();
      weather = nextId
        ? { id: nextId, daysLeft: 1 }
        : rollWeather(genre, rng);
      changed = true;
    }
    if (forecast.length < 5) forecast = buildForecast(weather, genre, rng);
  }
  return { weather, forecast, accum, changed };
}

export interface WeatherImpact {
  hp: number;
  needs: { hunger?: number; thirst?: number; sleep?: number; temp?: number };
  lose: Stack[];
  messages: string[];
  modifier: { id: string; label: string; skills: Record<string, number>; turns: number } | null;
}

const ELECTRONIC = (name: string) => getItem(name).tags.includes('electronic');
const WARM = (name: string) => getItem(name).tags.includes('warm');

/**
 * Efectos del clima sobre el personaje. Puro: devuelve deltas, no los aplica.
 * `sheltered` lo decide la zona actual, no un análisis del texto del jugador.
 */
export function weatherImpact(
  weather: WeatherState, sheltered: boolean, inventory: Stack[], minutes: number,
  traits: string[], rng: () => number,
): WeatherImpact {
  const out: WeatherImpact = { hp: 0, needs: {}, lose: [], messages: [], modifier: null };
  const def = WEATHER[weather.id];
  if (!def.severe) {
    if (weather.id === 'rain' && !sheltered) {
      out.needs.temp = -0.4;
      out.needs.thirst = 5;
      out.messages.push('La lluvia te cala, pero al menos puedes recoger agua.');
    }
    return out;
  }
  const hours = clamp(minutes / 60, 0.25, 8);
  const scale = Math.min(3, hours);

  if (sheltered) {
    out.messages.push(`${def.icon} ${def.label}: estás a cubierto. Fuera no se puede hacer nada.`);
    return out;
  }

  switch (weather.id) {
    case 'acid_rain': {
      out.hp -= Math.round(7 * scale);
      out.messages.push('La lluvia corrosiva te abrasa la piel expuesta. Busca techo.');
      const clothes = inventory.filter((s) => getItem(s.name).tags.includes('clothing'));
      if (clothes.length && rng() < 0.35) {
        const victim = clothes[Math.floor(rng() * clothes.length)];
        out.lose.push({ name: victim.name, qty: 1 });
        out.messages.push(`La ácido ha deshecho tu ${victim.name}.`);
      }
      break;
    }
    case 'tornado': {
      out.hp -= Math.round(12 * scale);
      out.needs.hunger = -6;
      out.needs.thirst = -6;
      out.messages.push('El tornado te zarandea sin piedad. Métete bajo tierra o dentro de algo sólido.');
      if (inventory.length && rng() < 0.4) {
        const lost = inventory[Math.floor(rng() * inventory.length)];
        out.lose.push({ name: lost.name, qty: 1 });
        out.messages.push(`El viento te arranca ${lost.name} de las manos.`);
      }
      break;
    }
    case 'heatstorm': {
      out.needs.thirst = -10 * scale;
      out.needs.temp = 1.2;
      out.hp -= Math.round(3 * scale);
      out.messages.push('El calor es insoportable. Tu cuerpo pierde agua mucho más rápido de lo normal.');
      break;
    }
    case 'ashstorm': {
      out.needs.hunger = -4 * scale;
      out.modifier = { id: 'ash', label: 'Ceniza en el aire', skills: { 'Rastreo': 2, 'Puntería': 2 }, turns: 3 };
      out.messages.push('La ceniza lo cubre todo: apenas ves a diez metros y respirar cuesta.');
      break;
    }
    case 'electric': {
      const gear = inventory.filter((s) => ELECTRONIC(s.name));
      if (gear.length && rng() < 0.4) {
        const victim = gear[Math.floor(rng() * gear.length)];
        out.lose.push({ name: victim.name, qty: 1 });
        out.messages.push(`Una descarga cercana fríe tu ${victim.name}.`);
      } else {
        out.hp -= Math.round(5 * scale);
        out.messages.push('Los rayos caen demasiado cerca. Aléjate de lo alto y de lo metálico.');
      }
      break;
    }
    case 'blizzard': {
      const warm = inventory.some((s) => WARM(s.name));
      const friolero = traits.includes('friolero');
      const mult = (warm ? 0.4 : 1) * (friolero ? 2 : 1);
      out.hp -= Math.round(6 * scale * mult);
      out.needs.temp = -2.5 * mult;
      out.needs.hunger = -5 * scale;
      out.messages.push(warm
        ? 'La ventisca muerde, pero tu abrigo aguanta lo justo.'
        : 'Sin ropa de abrigo, la ventisca te está matando poco a poco.');
      break;
    }
    default: break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapa
// ─────────────────────────────────────────────────────────────────────────────
const NODE_RADIUS = 140;
const MIN_GAP = 96;

/** Coloca un nodo nuevo cerca de su padre sin solaparse con los existentes. */
function placeNode(nodes: Record<string, ZoneNode>, parent: ZoneNode | undefined, rng: () => number) {
  const baseX = parent?.x ?? 400;
  const baseY = parent?.y ?? 300;
  let best = { x: baseX + NODE_RADIUS, y: baseY, score: -Infinity };
  for (let i = 0; i < 24; i++) {
    const angle = rng() * Math.PI * 2;
    const dist = NODE_RADIUS * (0.8 + rng() * 0.5);
    const x = baseX + Math.cos(angle) * dist;
    const y = baseY + Math.sin(angle) * dist;
    const nearest = Object.values(nodes).reduce(
      (min, n) => Math.min(min, Math.hypot(n.x - x, n.y - y)), Infinity,
    );
    if (nearest > MIN_GAP) return { x, y };
    if (nearest > best.score) best = { x, y, score: nearest };
  }
  return { x: best.x, y: best.y };
}

export interface MapUpdate {
  currentZone: string;
  type: ZoneType;
  danger: number;
  connections: string[];
}

export function applyMapUpdate(
  map: MapState, upd: MapUpdate, day: number, rng: () => number,
): { map: MapState; discovered: string[] } {
  const nodes: Record<string, ZoneNode> = Object.fromEntries(
    Object.entries(map.nodes).map(([k, v]) => [k, { ...v, connections: [...v.connections] }]),
  );
  const discovered: string[] = [];
  const zone = upd.currentZone.trim() || map.currentZone || 'Inicio';

  if (!nodes[zone]) {
    const { x, y } = placeNode(nodes, nodes[map.currentZone], rng);
    nodes[zone] = { type: upd.type, danger: clamp(upd.danger, 1, 5), visited: true, x, y, connections: [], discoveredDay: day };
    discovered.push(zone);
  } else {
    if (!nodes[zone].visited) discovered.push(zone);
    nodes[zone] = {
      ...nodes[zone],
      visited: true,
      type: nodes[zone].type === 'unknown' ? upd.type : nodes[zone].type,
      danger: clamp(upd.danger, 1, 5),
      discoveredDay: nodes[zone].discoveredDay ?? day,
    };
  }

  // Enlazar con la zona de la que venimos, para que el mapa quede conectado.
  const previous = map.currentZone;
  if (previous && previous !== zone && nodes[previous]) {
    if (!nodes[zone].connections.includes(previous)) nodes[zone].connections.push(previous);
    if (!nodes[previous].connections.includes(zone)) nodes[previous].connections.push(zone);
  }

  for (const raw of upd.connections.slice(0, 4)) {
    const conn = raw.trim();
    if (!conn || conn === zone) continue;
    if (!nodes[conn]) {
      const { x, y } = placeNode(nodes, nodes[zone], rng);
      nodes[conn] = { type: 'unknown', danger: 0, visited: false, x, y, connections: [zone] };
    } else if (!nodes[conn].connections.includes(zone)) {
      nodes[conn].connections.push(zone);
    }
    if (!nodes[zone].connections.includes(conn)) nodes[zone].connections.push(conn);
  }

  return { map: { nodes, currentZone: zone }, discovered };
}

export function currentNode(map: MapState): ZoneNode | undefined {
  return map.nodes[map.currentZone];
}

export function isSheltered(map: MapState): boolean {
  const n = currentNode(map);
  return n?.type === 'indoor' || n?.type === 'underground';
}

export const ZONE_TYPES: Record<ZoneType, { label: string; icon: string }> = {
  urban:       { label: 'Urbano',      icon: '🏙️' },
  wilderness:  { label: 'Naturaleza',  icon: '🌲' },
  indoor:      { label: 'Interior',    icon: '🚪' },
  underground: { label: 'Subterráneo', icon: '🕳️' },
  water:       { label: 'Agua',        icon: '🌊' },
  unknown:     { label: 'Sin explorar', icon: '❔' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Ambiente sonoro
// ─────────────────────────────────────────────────────────────────────────────
export function inferMood(state: GameState): Mood {
  const node = currentNode(state.map);
  const danger = node?.danger ?? 1;
  const sheltered = isSheltered(state.map);
  const hpPct = state.hp / (state.maxHp || 100);
  const severe = WEATHER[state.weather.id].severe;
  const grave = state.injuries.some((i) => i.severity >= 3);

  if (hpPct < 0.25 || grave) return 'danger';
  if (severe && !sheltered) return 'weather';
  if (danger >= 4) return 'combat';
  if (danger >= 3 || hpPct < 0.5) return 'tense';
  if (sheltered && state.needs.sleep > 55) return 'rest';
  return 'explore';
}
