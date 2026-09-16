import type { GenreId } from '../engine/types';

export interface Archetype {
  id: string;
  icon: string;
  /** Nombre y descripción por género — el mismo rol, distinto mundo. */
  skins: Record<GenreId, { label: string; desc: string }>;
  bonuses: Record<string, number>;
  penalties: Record<string, number>;
  items: string[];
  recipes: string[];
}

const g = (
  apocalypse: [string, string], fantasy: [string, string], scifi: [string, string],
  horror: [string, string], mystery: [string, string],
): Archetype['skins'] => ({
  apocalypse: { label: apocalypse[0], desc: apocalypse[1] },
  fantasy:    { label: fantasy[0],    desc: fantasy[1] },
  scifi:      { label: scifi[0],      desc: scifi[1] },
  horror:     { label: horror[0],     desc: horror[1] },
  mystery:    { label: mystery[0],    desc: mystery[1] },
});

export const ARCHETYPES: Archetype[] = [
  {
    id: 'warrior', icon: '🪖',
    skins: g(
      ['Soldado', 'Veterano endurecido. Sabe moverse bajo fuego y qué hacer cuando todo se tuerce.'],
      ['Mercenario', 'Vendió su espada a demasiados señores. Ninguno le pagó lo prometido.'],
      ['Marine colonial', 'Entrenado para asegurar perímetros en mundos que no quieren visitas.'],
      ['Ex-policía', 'Veinte años de turnos de noche. Sabe cuándo un sitio está mal.'],
      ['Guardaespaldas', 'Cobra por interponerse. Últimamente le disparan a él.'],
    ),
    bonuses: { 'Puntería': 3, 'Recarga': 2, 'Contundente': 2 },
    penalties: { 'Cultivo': -2, 'Cocina': -1 },
    items: ['Pistola', 'Cargador 9mm', 'Cargador 9mm', 'Botiquín pequeño', 'Linterna', 'Mochila pequeña', 'Lata de comida', 'Agua (500ml)', 'Cuchillo'],
    recipes: ['Lanza improvisada', 'Trampa de caza'],
  },
  {
    id: 'healer', icon: '🩺',
    skins: g(
      ['Médico', 'Cirujano de urgencias. Salva vidas con lo que encuentra en un cajón.'],
      ['Sanadora', 'Conoce las hierbas y los huesos. La gente la teme casi tanto como la necesita.'],
      ['Oficial médico', 'Llevaba la enfermería de la colonia. Ahora la lleva sin suministros.'],
      ['Enfermera de noche', 'Ha visto morir a mucha gente. Nunca así.'],
      ['Forense', 'Los cuerpos le cuentan cosas que los vivos niegan.'],
    ),
    bonuses: { 'Primeros auxilios': 4, 'Fuerza': 1 },
    penalties: { 'Puntería': -2, 'Hacha': -1 },
    items: ['Botiquín completo', 'Morfina', 'Bisturí', 'Antibióticos', 'Vendas x5', 'Mochila pequeña', 'Agua (500ml)', 'Barrita energética', 'Manual de medicina'],
    recipes: ['Vendas improvisadas', 'Botiquín improvisado', 'Suero de rehidratación', 'Yoduro de potasio', 'Carbón activado'],
  },
  {
    id: 'engineer', icon: '🔩',
    skins: g(
      ['Mecánico', 'Repara motores, generadores y casi cualquier cosa con tornillos.'],
      ['Artesano', 'Forja, remacha y ajusta. Sin él, nada de lo que tenéis funciona.'],
      ['Técnico de sistemas', 'Mantiene vivo el soporte vital a base de parches y suerte.'],
      ['Electricista', 'Sabe por qué las luces parpadean. Esta vez no es el cableado.'],
      ['Cerrajero', 'Abre lo que otros cierran. Discretamente y por un precio.'],
    ),
    bonuses: { 'Mecánica': 4, 'Electricidad': 2, 'Carpintería': 2 },
    penalties: { 'Sigilo': -2, 'Puntería': -1 },
    items: ['Herramientas básicas', 'Kit de reparación', 'Linterna', 'Mochila pequeña', 'Lata de comida', 'Agua (500ml)', 'Cuchillo', 'Mechero', 'Manual de ingeniería'],
    recipes: ['Destilador de agua', 'Barricada de madera', 'Trampa de caza'],
  },
  {
    id: 'hunter', icon: '🏹',
    skins: g(
      ['Cazador', 'Criado en el campo. Se mueve sin ruido y alimenta al grupo desde la nada.'],
      ['Montaraz', 'Vive de los bosques. Los bosques todavía no lo han reclamado.'],
      ['Rastreadora de superficie', 'Sale al exterior cuando nadie más se atreve.'],
      ['Guarda forestal', 'Conoce cada sendero. Últimamente algunos no llevan a donde deberían.'],
      ['Investigador privado', 'Sigue rastros, no huellas. El principio es el mismo.'],
    ),
    bonuses: { 'Rastreo': 3, 'Trampas': 3, 'Pesca': 2, 'Sigilo': 2 },
    penalties: { 'Albañilería': -2, 'Electricidad': -1 },
    items: ['Arco', 'Flechas x10', 'Trampa metálica', 'Cuchillo', 'Caña de pescar', 'Mochila pequeña', 'Lata de comida', 'Agua (500ml)', 'Brújula'],
    recipes: ['Lanza de madera', 'Trampa de caza', 'Flechas artesanales', 'Caña de pescar improvisada'],
  },
  {
    id: 'cook', icon: '🍳',
    skins: g(
      ['Cocinero', 'El alma del grupo. Convierte cualquier cosa en comida que mantiene vivo a alguien.'],
      ['Tabernero', 'Ha oído todos los rumores del reino sirviendo cerveza aguada.'],
      ['Hidropónico', 'Cultivaba la ración de doscientas personas bajo luz artificial.'],
      ['Dueño del motel', 'Conoce a todos los que pasaron por aquí. También a los que no salieron.'],
      ['Camarera del diner', 'Escucha más de lo que la gente cree que escucha.'],
    ),
    bonuses: { 'Cocina': 4, 'Cultivo': 2, 'Cría de animales': 2 },
    penalties: { 'Hacha': -2, 'Hoja larga': -1 },
    items: ['Navaja multiusos', 'Semillas variadas', 'Comida enlatada x3', 'Botella de agua', 'Mechero', 'Mochila pequeña', 'Cuerda (5m)', 'Barrita energética'],
    recipes: ['Ración de campo', 'Caldo medicinal', 'Suero de rehidratación'],
  },
  {
    id: 'builder', icon: '🧱',
    skins: g(
      ['Albañil', 'Constructor nato. Levanta muros y refugios con lo que haya a mano.'],
      ['Cantero', 'Levantó torres para señores que ya no existen.'],
      ['Ingeniera estructural', 'Sabe exactamente cuánto aguanta un mamparo. Hasta el kilo.'],
      ['Contratista', 'Reformaba casas viejas. Esta casa tiene habitaciones de más.'],
      ['Estibador', 'Espaldas anchas y contactos en el puerto.'],
    ),
    bonuses: { 'Albañilería': 4, 'Carpintería': 3, 'Herrería': 2 },
    penalties: { 'Sigilo': -3, 'Rastreo': -1 },
    items: ['Herramientas básicas', 'Cuerda (5m)', 'Mochila pequeña', 'Lata de comida', 'Agua (500ml)', 'Hacha de mano', 'Mechero', 'Linterna', 'Madera'],
    recipes: ['Barricada de madera', 'Antorcha', 'Mochila improvisada', 'Rasgar trapos'],
  },
  {
    id: 'scout', icon: '🧭',
    skins: g(
      ['Explorador', 'Conoce el terreno. Siempre encuentra una ruta y algo que traer de vuelta.'],
      ['Batidor', 'Va por delante de la columna. Vuelve casi siempre.'],
      ['Piloto de sonda', 'Cartografió la superficie antes de que la superficie cambiara.'],
      ['Espeleólogo', 'Baja donde no hay señal ni excusas.'],
      ['Reportero', 'Va a los sitios a los que le dicen que no vaya.'],
    ),
    bonuses: { 'Rastreo': 2, 'Sigilo': 3, 'Pesca': 2, 'Trampas': 2 },
    penalties: { 'Albañilería': -2, 'Herrería': -1 },
    items: ['Mapa de la zona', 'Brújula', 'Linterna', 'Cuchillo', 'Mochila pequeña', 'Agua (500ml)', 'Barrita energética', 'Cuerda (5m)', 'Reloj de pulsera'],
    recipes: ['Antorcha', 'Caña de pescar improvisada', 'Flechas artesanales'],
  },
  {
    id: 'leader', icon: '📣',
    skins: g(
      ['Líder', 'Carismático y organizado. La gente le sigue aunque no sepa a dónde.'],
      ['Capitán', 'Mandó hombres a morir. Todavía duerme, pero poco.'],
      ['Comandante de sección', 'La cadena de mando se rompió. Alguien tenía que dar órdenes.'],
      ['Alcaldesa', 'Conoce a todos los vecinos. Ninguno le está contando todo.'],
      ['Abogado', 'Sabe qué preguntar y, sobre todo, qué no.'],
    ),
    bonuses: { 'Primeros auxilios': 2, 'Cocina': 2, 'Carpintería': 1, 'Cultivo': 1 },
    penalties: { 'Puntería': -1 },
    items: ['Radio walkie-talkie', 'Botiquín pequeño', 'Mapa de la zona', 'Mochila pequeña', 'Lata de comida', 'Agua (500ml)', 'Libreta y lápiz', 'Mechero', 'Cuchillo'],
    recipes: ['Vendas improvisadas', 'Antorcha'],
  },
  {
    id: 'alchemist', icon: '🧪',
    skins: g(
      ['Químico', 'Fabrica medicinas, venenos y explosivos con material de ferretería.'],
      ['Alquimista', 'Mezcla lo que no debería mezclarse. A veces funciona.'],
      ['Xenobióloga', 'Analiza lo que hay fuera. Preferiría no tener tanto material de estudio.'],
      ['Farmacéutica', 'Sabe qué hace cada frasco de la trastienda.'],
      ['Químico de la policía', 'El laboratorio le dice quién estuvo allí.'],
    ),
    bonuses: { 'Cocina': 3, 'Electricidad': 2, 'Mecánica': 1 },
    penalties: { 'Puntería': -2, 'Hacha': -2, 'Contundente': -1 },
    items: ['Materiales químicos', 'Botiquín pequeño', 'Mechero', 'Mochila pequeña', 'Agua (500ml)', 'Barrita energética', 'Navaja multiusos', 'Linterna'],
    recipes: ['Explosivo casero', 'Analgésico casero', 'Suero de rehidratación'],
  },
  {
    id: 'thief', icon: '🗝️',
    skins: g(
      ['Saqueador', 'Entra donde está cerrado y encuentra lo que nadie más ve.'],
      ['Ladrona', 'Los bolsillos ajenos financiaron su educación.'],
      ['Contrabandista', 'Movía carga sin manifiesto entre estaciones.'],
      ['Okupa', 'Lleva semanas viviendo aquí. Sabe qué tablones crujen.'],
      ['Carterista', 'Manos rápidas y una memoria excelente para las caras.'],
    ),
    bonuses: { 'Sigilo': 4, 'Rastreo': 3, 'Hoja corta': 2 },
    penalties: { 'Fuerza': -2, 'Albañilería': -2 },
    items: ['Ganzúas', 'Cuchillo', 'Linterna', 'Mochila pequeña', 'Agua (500ml)', 'Lata de comida', 'Cuerda (5m)', 'Mechero'],
    recipes: ['Antorcha', 'Lanza de madera'],
  },
  {
    id: 'beastkeeper', icon: '🐾',
    skins: g(
      ['Veterinario', 'Trata heridas animales y humanas. La diferencia es menor de lo que parece.'],
      ['Domadora', 'Los animales le hacen caso. La gente, menos.'],
      ['Bióloga de campo', 'Catalogaba fauna local. La fauna local la catalogó a ella.'],
      ['Cuidador del refugio', 'Los perros dejaron de ladrar hace tres días.'],
      ['Corredor de apuestas', 'Caballos, galgos y personas. Todo es cuestión de leer al animal.'],
    ),
    bonuses: { 'Primeros auxilios': 3, 'Cría de animales': 4, 'Rastreo': 1 },
    penalties: { 'Puntería': -2, 'Hacha': -2, 'Contundente': -1 },
    items: ['Sedante animal', 'Botiquín completo', 'Vendas x5', 'Mochila pequeña', 'Agua (500ml)', 'Barrita energética', 'Navaja multiusos', 'Caña de pescar'],
    recipes: ['Vendas improvisadas', 'Botiquín improvisado'],
  },
  {
    id: 'preacher', icon: '📿',
    skins: g(
      ['Predicador', 'Su poder es la palabra. Resiste el pánico e inspira a los demás.'],
      ['Clériga', 'La fe le sostiene. No siempre le responde.'],
      ['Consejera de tripulación', 'Mantiene la cabeza de la gente en su sitio cuando todo falla.'],
      ['Párroco', 'Lleva cuarenta años en este pueblo. Sabe qué se enterró y dónde.'],
      ['Confidente', 'Todo el mundo le cuenta cosas. Por eso sigue vivo.'],
    ),
    bonuses: { 'Cocina': 2, 'Cultivo': 2, 'Primeros auxilios': 1 },
    penalties: { 'Mecánica': -2, 'Electricidad': -2, 'Herrería': -1 },
    items: ['Biblia', 'Botiquín pequeño', 'Mochila pequeña', 'Agua (500ml)', 'Comida enlatada x3', 'Mechero', 'Cuerda (5m)', 'Libreta y lápiz'],
    recipes: ['Caldo medicinal', 'Vendas improvisadas'],
  },
  {
    id: 'miner', icon: '⛏️',
    skins: g(
      ['Minero', 'Especialista en subsuelo y estructuras. Aguanta lo que nadie aguanta.'],
      ['Enano de las minas', 'La piedra le habla. Literalmente, dice él.'],
      ['Operario de perforación', 'Abrió los túneles de la colonia. Conoce cada galería.'],
      ['Sepulturero', 'Cava desde los quince. Últimamente encuentra tumbas abiertas.'],
      ['Trabajador del metro', 'Los túneles de la ciudad son su territorio.'],
    ),
    bonuses: { 'Albañilería': 4, 'Fuerza': 3, 'Herrería': 2 },
    penalties: { 'Sigilo': -3, 'Rastreo': -2 },
    items: ['Pico', 'Herramientas básicas', 'Linterna', 'Mochila pequeña', 'Agua (500ml)', 'Lata de comida', 'Mechero', 'Cuerda (5m)'],
    recipes: ['Barricada de madera', 'Antorcha'],
  },
  {
    id: 'outlaw', icon: '🔒',
    skins: g(
      ['Ex-convicto', 'Duro de matar. Conoce los bajos fondos y cómo se sobrevive en ellos.'],
      ['Proscrito', 'Hay una recompensa por su cabeza en tres condados.'],
      ['Preso de la bodega', 'Cumplía condena en el módulo de carga. El módulo se abrió solo.'],
      ['Recién salido', 'Ocho años dentro. La ciudad cambió. Él no tanto.'],
      ['Matón arrepentido', 'Trabajó para la gente equivocada demasiado tiempo.'],
    ),
    bonuses: { 'Contundente': 3, 'Hoja corta': 3, 'Sigilo': 2, 'Fuerza': 1 },
    penalties: { 'Primeros auxilios': -3, 'Cultivo': -2 },
    items: ['Cuchillo', 'Bate de béisbol', 'Mechero', 'Agua (500ml)', 'Lata de comida', 'Vendas x5', 'Mochila pequeña', 'Trapos'],
    recipes: ['Lanza de madera', 'Rasgar trapos'],
  },
];

export const ARCHETYPE_BY_ID = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));

export function archetypeName(id: string | null, genre: GenreId | null): string {
  if (!id) return '—';
  const a = ARCHETYPE_BY_ID[id];
  if (!a) return id;
  return a.skins[genre ?? 'apocalypse'].label;
}
