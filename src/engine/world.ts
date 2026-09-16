import { GENRES } from '../data/genres';
import { WEATHER } from '../data/conditions';
import { getItem, type ItemCatalog } from '../data/items';
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

const ELECTRONIC = (name: string, c?: ItemCatalog) => getItem(name, c).tags.includes('electronic');
const WARM = (name: string, c?: ItemCatalog) => getItem(name, c).tags.includes('warm');

/**
 * Efectos del clima sobre el personaje. Puro: devuelve deltas, no los aplica.
 * `sheltered` lo decide la zona actual, no un análisis del texto del jugador.
 */
export function weatherImpact(
  weather: WeatherState, sheltered: boolean, inventory: Stack[], minutes: number,
  traits: string[], rng: () => number, catalog?: ItemCatalog,
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
      const clothes = inventory.filter((s) => getItem(s.name, catalog).tags.includes('clothing'));
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
      const gear = inventory.filter((s) => ELECTRONIC(s.name, catalog));
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
      const warm = inventory.some((s) => WARM(s.name, catalog));
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
const IDEAL_EDGE = 130;   // distancia que intentan mantener dos zonas conectadas
const MIN_GAP = 88;       // a menos de esto, dos nodos se empujan
const CENTER = { x: 400, y: 300 };
const GRAVITY = 0.035;    // mantiene compacto el mapa en recorridos largos

/**
 * Coloca los nodos con un relajado de fuerzas: las zonas conectadas se atraen
 * hasta una distancia cómoda y todas se repelen entre sí.
 *
 * Antes cada zona nueva se ponía a 140 px del padre en una dirección al azar.
 * Eso es un paseo aleatorio: a las veinte zonas el mapa medía 800×1300 px,
 * salía de la ventana y formaba cadenas en lugar de un mapa.
 *
 * Es determinista: mismas posiciones de entrada, mismas de salida.
 */
export function relaxLayout(
  nodes: Record<string, ZoneNode>, iterations = 30,
): Record<string, ZoneNode> {
  const names = Object.keys(nodes);
  if (names.length < 2) return nodes;

  const pos = names.map((n) => ({ x: nodes[n].x, y: nodes[n].y }));
  const index = new Map(names.map((n, i) => [n, i]));

  // Aristas únicas, en índices.
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  names.forEach((name, i) => {
    for (const conn of nodes[name].connections) {
      const j = index.get(conn);
      if (j === undefined || j === i) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  });

  const n = names.length;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);

  for (let it = 0; it < iterations; it++) {
    // El enfriamiento evita que los últimos pasos deshagan lo ya colocado.
    const cool = 1 - it / iterations;
    fx.fill(0); fy.fill(0);

    // Repulsión entre todos los pares cercanos.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d = Math.hypot(dx, dy);
        if (d > MIN_GAP * 3) continue;
        if (d < 0.01) {
          // Nodos exactamente encima: los separamos de forma determinista.
          dx = ((i * 37 + j * 11) % 17) - 8;
          dy = ((i * 13 + j * 29) % 17) - 8;
          d = Math.hypot(dx, dy) || 1;
        }
        const force = (MIN_GAP * 2.2 - Math.min(d, MIN_GAP * 2.2)) / d * 0.5;
        fx[i] += dx * force; fy[i] += dy * force;
        fx[j] -= dx * force; fy[j] -= dy * force;
      }
    }

    // Gravedad hacia el centro de masas. Sin ella, un recorrido largo en cadena
    // se estira en línea recta y el mapa acaba midiendo miles de píxeles; con
    // ella la cadena se enrolla y cabe en la ventana.
    let gx = 0, gy = 0;
    for (const p of pos) { gx += p.x; gy += p.y; }
    gx /= n; gy /= n;
    for (let i = 0; i < n; i++) {
      fx[i] += (gx - pos[i].x) * GRAVITY;
      fy[i] += (gy - pos[i].y) * GRAVITY;
    }

    // Atracción a lo largo de las conexiones.
    for (const [i, j] of edges) {
      const dx = pos[j].x - pos[i].x;
      const dy = pos[j].y - pos[i].y;
      const d = Math.hypot(dx, dy) || 1;
      const force = (d - IDEAL_EDGE) / d * 0.12;
      fx[i] += dx * force; fy[i] += dy * force;
      fx[j] -= dx * force; fy[j] -= dy * force;
    }

    const step = 0.85 * cool;
    for (let i = 0; i < n; i++) {
      pos[i].x += Math.max(-24, Math.min(24, fx[i])) * step;
      pos[i].y += Math.max(-24, Math.min(24, fy[i])) * step;
    }
  }

  // Recentramos para que el mapa no se vaya derivando partida tras partida.
  let cx = 0, cy = 0;
  for (const p of pos) { cx += p.x; cy += p.y; }
  cx = cx / n - CENTER.x;
  cy = cy / n - CENTER.y;

  const out: Record<string, ZoneNode> = {};
  names.forEach((name, i) => {
    out[name] = {
      ...nodes[name],
      x: Math.round((pos[i].x - cx) * 10) / 10,
      y: Math.round((pos[i].y - cy) * 10) / 10,
    };
  });
  return out;
}

/** Punto de partida para un nodo nuevo, cerca de su vecino conocido. */
function seedPosition(
  nodes: Record<string, ZoneNode>, parent: ZoneNode | undefined, rng: () => number,
) {
  const baseX = parent?.x ?? CENTER.x;
  const baseY = parent?.y ?? CENTER.y;
  // Lo colocamos alejándose del centro de masas para no meterlo en el montón.
  const all = Object.values(nodes);
  let cx = CENTER.x, cy = CENTER.y;
  if (all.length) {
    cx = all.reduce((s, v) => s + v.x, 0) / all.length;
    cy = all.reduce((s, v) => s + v.y, 0) / all.length;
  }
  const away = Math.atan2(baseY - cy, baseX - cx);
  const angle = away + (rng() - 0.5) * Math.PI * 1.1;
  return {
    x: baseX + Math.cos(angle) * IDEAL_EDGE,
    y: baseY + Math.sin(angle) * IDEAL_EDGE,
  };
}

export interface MapUpdate {
  currentZone: string;
  type: ZoneType;
  danger: number;
  connections: string[];
}

/** Días que sobrevive una zona propuesta por el narrador si no se visita. */
const GHOST_TTL_DAYS = 5;

export function applyMapUpdate(
  map: MapState, upd: MapUpdate, day: number, rng: () => number,
): { map: MapState; discovered: string[] } {
  const nodes: Record<string, ZoneNode> = Object.fromEntries(
    Object.entries(map.nodes).map(([k, v]) => [k, { ...v, connections: [...v.connections] }]),
  );
  const discovered: string[] = [];
  const zone = upd.currentZone.trim() || map.currentZone || 'Inicio';

  let added = false;
  if (!nodes[zone]) {
    const { x, y } = seedPosition(nodes, nodes[map.currentZone], rng);
    nodes[zone] = { type: upd.type, danger: clamp(upd.danger, 1, 5), visited: true, x, y, connections: [], discoveredDay: day };
    discovered.push(zone);
    added = true;
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
      const { x, y } = seedPosition(nodes, nodes[zone], rng);
      nodes[conn] = { type: 'unknown', danger: 0, visited: false, x, y, connections: [zone], discoveredDay: day };
      added = true;
    } else if (!nodes[conn].connections.includes(zone)) {
      nodes[conn].connections.push(zone);
    }
    if (!nodes[zone].connections.includes(conn)) nodes[zone].connections.push(conn);
  }

  // El mundo también se olvida: las zonas propuestas que siguen sin visitar
  // cinco días después desaparecen, o el mapa se llena de círculos grises.
  for (const [name, n] of Object.entries(nodes)) {
    if (n.visited || name === zone) continue;
    if (day - (n.discoveredDay ?? day) < GHOST_TTL_DAYS) continue;
    if (n.connections.includes(zone)) continue;
    delete nodes[name];
    for (const otro of Object.values(nodes)) {
      const i = otro.connections.indexOf(name);
      if (i >= 0) otro.connections.splice(i, 1);
    }
  }

  // Solo reordenamos cuando hay algo nuevo, y con menos iteraciones cuantos más
  // nodos haya: el coste es cuadrático y bloqueaba el hilo principal.
  const total = Object.keys(nodes).length;
  const iteraciones = total > 160 ? 8 : total > 80 ? 15 : 30;
  const laid = added ? relaxLayout(nodes, iteraciones) : nodes;
  return { map: { nodes: laid, currentZone: zone }, discovered };
}

/** Camino más corto entre dos zonas, en número de saltos. */
export function shortestPath(map: MapState, from: string, to: string): string[] | null {
  if (from === to) return [from];
  if (!map.nodes[from] || !map.nodes[to]) return null;
  const previo = new Map<string, string>([[from, '']]);
  const cola = [from];
  while (cola.length) {
    const actual = cola.shift()!;
    for (const vecino of map.nodes[actual]?.connections ?? []) {
      if (previo.has(vecino) || !map.nodes[vecino]) continue;
      previo.set(vecino, actual);
      if (vecino === to) {
        const camino = [to];
        let paso = actual;
        while (paso) { camino.unshift(paso); paso = previo.get(paso) ?? ''; }
        return camino;
      }
      cola.push(vecino);
    }
  }
  return null;
}

/** Saltos entre dos zonas. Si no hay camino conocido, se estima por distancia. */
export function graphDistance(map: MapState, from: string, to: string): number {
  const camino = shortestPath(map, from, to);
  if (camino) return Math.max(1, camino.length - 1);
  const a = map.nodes[from];
  const b = map.nodes[to];
  if (!a || !b) return 2;
  return clamp(Math.round(Math.hypot(a.x - b.x, a.y - b.y) / 130), 1, 8);
}

/** Peligro medio de las zonas que hay que atravesar. */
export function averageDanger(map: MapState, from: string, to: string): number {
  const camino = shortestPath(map, from, to) ?? [from, to];
  const valores = camino.map((n) => map.nodes[n]?.danger ?? 2);
  return valores.reduce((a, b) => a + b, 0) / valores.length;
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
