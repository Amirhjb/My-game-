import type { GenreId, WeatherId } from '../engine/types';

export interface GenreDef {
  id: GenreId;
  label: string;
  emoji: string;
  /** Tono OKLCH del acento + croma. Define la piel visual completa. */
  hue: number;
  chroma: number;
  tagline: string;
  /** Premisa que se inyecta en el prompt del sistema. */
  premise: string;
  /** Sufijo de estilo para el generador de imágenes. */
  imageStyle: string;
  /** Climas posibles con su peso relativo. */
  weather: Partial<Record<WeatherId, number>>;
  /** Amenazas típicas — orienta al narrador. */
  threats: string;
  /** Sustituciones de objetos para que el equipo encaje con el género. */
  itemSkin: Record<string, string>;
}

export const GENRES: Record<GenreId, GenreDef> = {
  apocalypse: {
    id: 'apocalypse',
    label: 'Post-apocalíptico',
    emoji: '☢',
    hue: 42,
    chroma: 0.13,
    tagline: 'Ceniza, óxido y lo que quedó de la gente',
    premise:
      'El mundo colapsó hace años. Ciudades vaciadas, carreteras rotas, radiación en los bajos. ' +
      'Quedan saqueadores, enfermos y comunidades pequeñas que desconfían de todo el mundo. ' +
      'Los recursos son escasos y cada bala, lata o litro de agua limpia cuenta.',
    imageStyle: 'post-apocalyptic wasteland, desaturated, volumetric dust, cinematic anamorphic, 35mm film grain',
    weather: { clear: 34, overcast: 16, rain: 8, fog: 8, acid_rain: 8, ashstorm: 10, heatstorm: 7, electric: 5, tornado: 2, blizzard: 2 },
    threats: 'saqueadores armados, perros salvajes, zonas radiactivas, estructuras a punto de colapsar, agua contaminada',
    itemSkin: {},
  },
  fantasy: {
    id: 'fantasy',
    label: 'Fantasía oscura',
    emoji: '⚔',
    hue: 295,
    chroma: 0.12,
    tagline: 'Reinos caídos y magia que cobra su precio',
    premise:
      'Un reino en decadencia tras una guerra perdida. Los caminos están tomados por bandidos y criaturas, ' +
      'los pueblos pagan diezmos a señores que ya no protegen a nadie, y la magia funciona pero siempre cobra algo. ' +
      'No hay héroes: hay gente intentando llegar al invierno siguiente.',
    imageStyle: 'dark fantasy oil painting, chiaroscuro lighting, muted earth tones, mist, painterly',
    weather: { clear: 34, overcast: 18, rain: 14, fog: 14, blizzard: 8, electric: 7, tornado: 2, heatstorm: 3 },
    threats: 'bandidos, bestias del bosque, cultos, maldiciones, hambre en los caminos, fiebre de los pantanos',
    itemSkin: {
      Pistola: 'Ballesta', 'Cargador 9mm': 'Virotes x10', Escopeta: 'Arco largo',
      Rifle: 'Arco largo', 'Bate de béisbol': 'Maza', Linterna: 'Farol de aceite',
      Mechero: 'Yesca y pedernal', 'Radio walkie-talkie': 'Cuerno de señales',
      'Reloj de pulsera': 'Reloj de arena', Antibióticos: 'Tintura de hierbas',
      'Explosivo casero': 'Frasco de fuego griego', Morfina: 'Adormidera',
    },
  },
  scifi: {
    id: 'scifi',
    label: 'Ciencia ficción',
    emoji: '🛰',
    hue: 215,
    chroma: 0.13,
    tagline: 'Una colonia lejos de casa y sin rescate',
    premise:
      'Estás en una colonia o estación aislada: el contacto con la central se perdió, los sistemas fallan uno a uno ' +
      'y el soporte vital depende de repuestos que ya no llegan. Fuera hay una atmósfera que no perdona. ' +
      'Sobrevivir es cuestión de energía, aire, presión y decisiones de ingeniería.',
    imageStyle: 'gritty hard sci-fi, industrial corridors, cold practical lighting, volumetric haze, cinematic still',
    weather: { clear: 30, overcast: 14, fog: 12, ashstorm: 14, electric: 12, heatstorm: 8, blizzard: 6, acid_rain: 4 },
    threats: 'fallos de presión, fauna xenobiológica, IA degradada, fugas de refrigerante, radiación estelar',
    itemSkin: {
      Pistola: 'Pistola de plasma', 'Cargador 9mm': 'Celda de energía',
      Linterna: 'Foco de casco', Mechero: 'Soplete de mano',
      'Botiquín completo': 'Autodoctor portátil', 'Mapa de la zona': 'Datapad topográfico',
      Brújula: 'Baliza inercial', 'Radio walkie-talkie': 'Comunicador de banda corta',
      'Ropa de abrigo': 'Traje térmico', 'Herramientas básicas': 'Multiherramienta de servicio',
    },
  },
  horror: {
    id: 'horror',
    label: 'Terror',
    emoji: '🕯',
    hue: 15,
    chroma: 0.11,
    tagline: 'Algo te está esperando y tiene paciencia',
    premise:
      'Un lugar aislado donde algo va profundamente mal: un pueblo que no aparece en los mapas, un complejo abandonado, ' +
      'un bosque del que la gente no vuelve. La amenaza rara vez se muestra entera. La luz, el ruido y la cordura son recursos ' +
      'tan reales como la comida. Huir casi siempre es mejor idea que mirar.',
    imageStyle: 'analog horror photography, harsh flash, deep shadows, decaying interiors, grain, unsettling composition',
    weather: { clear: 20, overcast: 24, rain: 18, fog: 26, electric: 8, blizzard: 4 },
    threats: 'una presencia que aprende de ti, cuerpos que no deberían estar ahí, oscuridad total, pérdida de cordura',
    itemSkin: {
      'Cargador 9mm': 'Caja de balas', Linterna: 'Linterna con pilas gastadas',
      'Radio walkie-talkie': 'Radio con interferencias',
    },
  },
  mystery: {
    id: 'mystery',
    label: 'Misterio noir',
    emoji: '🔍',
    hue: 180,
    chroma: 0.09,
    tagline: 'Todos mienten y tú también',
    premise:
      'Una ciudad húmeda y corrupta a mediados de siglo. Hay un caso abierto, demasiados interesados en cerrarlo ' +
      'y muy poca gente dispuesta a decir la verdad. Las armas importan menos que las conversaciones, las pruebas ' +
      'y saber cuándo callarse. Cada pregunta que haces te hace más visible.',
    imageStyle: 'film noir photograph, high contrast black and white with amber streetlight, rain on glass, 1950s city',
    weather: { clear: 22, overcast: 26, rain: 30, fog: 18, electric: 4 },
    threats: 'policía comprada, matones a sueldo, testigos que desaparecen, chantaje, tu propio pasado',
    itemSkin: {
      'Cargador 9mm': 'Caja de balas .38', Escopeta: 'Revólver del 38',
      'Radio walkie-talkie': 'Radio de bolsillo', 'Mapa de la zona': 'Plano de la ciudad',
      'Barrita energética': 'Paquete de cigarrillos', 'Lata de comida': 'Fiambrera del diner',
    },
  },
};

export const GENRE_LIST = Object.values(GENRES);

/** Traduce el nombre canónico de un objeto al vocabulario del género. */
export function skinItem(name: string, genre: GenreId | null): string {
  if (!genre) return name;
  return GENRES[genre].itemSkin[name] ?? name;
}
