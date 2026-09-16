# ☢ Último Relato

Aventura narrativa de supervivencia generada por IA. Escribes lo que quieres hacer, un
modelo de lenguaje narra lo que ocurre y **el motor del juego decide las consecuencias**:
el tiempo que pasa, lo que pesa tu mochila, las heridas que se infectan, el agua que se
acaba y el día que no llegas a ver.

Es la reescritura completa de un prototipo anterior de un solo fichero HTML. Mismo espíritu,
todo lo demás nuevo: arquitectura, interfaz, reglas y seguridad.

---

## Empezar a jugar en 3 minutos

### Opción A — un solo fichero (lo más fácil)

1. Descarga [`jugar.html`](jugar.html) — es el juego entero en un solo fichero.
2. Ábrelo con doble clic en cualquier navegador moderno.
3. Pulsa **Ajustes**, elige **Groq**, pega tu clave y listo.

### Opción B — con la clave ya integrada

Si no quieres escribirla nunca, ponla en `.env.local` y compílala dentro del fichero:

```bash
cp .env.example .env.local   # pega tu clave en VITE_API_KEY
npm install
npm run dist                 # genera jugar.html con la clave dentro
```

Ese `jugar.html` arranca directo, sin pasar por Ajustes. `.env.local` está en `.gitignore`,
así que la clave no se sube al repositorio — que es lo que hay que evitar, porque
**este repositorio es público y GitHub revoca automáticamente las claves que detecta en el código.**

Las claves de Groq son gratuitas: <https://console.groq.com/keys>

### Opción C — desde el código

```bash
npm install
npm run dev          # http://localhost:5173
```

### Construir

```bash
npm run build         # dist/         → carpeta web normal (GitHub Pages, Netlify…)
npm run build:single  # dist-single/  → un único index.html autocontenido
npm test              # pruebas del motor
npm run check         # tipos + pruebas + build
```

---

## Sobre la clave de API

**El juego no trae ninguna clave incluida.** Tú pones la tuya, se guarda solo en el
`localStorage` de tu navegador y únicamente se envía al proveedor que elijas.

> ⚠️ **Si vienes del prototipo anterior:** aquel HTML llevaba una clave de Groq escrita
> en el código fuente y el repositorio es público. **Revócala en
> <https://console.groq.com/keys> y genera una nueva** para `.env.local`.

Proveedores soportados (cualquiera compatible con la API de OpenAI):

| Proveedor | Coste | Notas |
|---|---|---|
| **Groq** | Capa gratuita | Muy rápido. La opción recomendada. |
| **Google Gemini** | Capa gratuita | Contexto muy largo y buena prosa en español. Clave en [aistudio.google.com](https://aistudio.google.com/apikey). |
| OpenAI | De pago | La mejor prosa. |
| OpenRouter | Mixto | Muchos modelos, algunos gratuitos. |
| Ollama | Gratis | Local, sin clave. Arráncalo con `OLLAMA_ORIGINS=* ollama serve` para que el navegador pueda llamarlo. |
| Otro | — | Cualquier endpoint con `/chat/completions`. |

Los proveedores retiran modelos cada pocos meses, así que la lista escrita en el código
envejece. El botón **Cargar modelos** de Ajustes le pregunta al proveedor qué admite tu clave
ahora mismo y te deja elegir; si el modelo guardado ya no existe, lo sustituye solo.

Las ilustraciones usan [Pollinations](https://pollinations.ai), que no necesita clave.
Se pueden desactivar en Ajustes.

---

## Qué hay dentro

### Cinco ambientaciones, no una decoración

El género no es un adorno: cambia la premisa del mundo, las amenazas, la tabla de climas,
el vocabulario del equipo (en fantasía tu pistola es una ballesta) y toda la paleta de la
interfaz, que deriva de un único tono OKLCH por género.

`Post-apocalíptico` · `Fantasía oscura` · `Ciencia ficción` · `Terror` · `Misterio noir`

### Sistemas

- **14 arquetipos** con habilidades, equipo y recetas propias, renombrados según el género.
  El «Soldado» del yermo es el «Mercenario» del reino y el «Ex-policía» del pueblo maldito.
- **28 rasgos** con economía de puntos: toda ventaja se paga con un defecto.
- **21 habilidades** en 5 ramas, con niveles, experiencia y penalizaciones por lesión,
  enfermedad y estados temporales.
- **Necesidades** (hambre, sed, sueño, temperatura corporal) que decaen con el tiempo real
  de juego y matan si las ignoras.
- **Lesiones por zona del cuerpo** que penalizan habilidades concretas y sanan solas con el
  tiempo, o empeoran si no las tratas.
- **6 enfermedades** con tres estadios cada una, contagio ambiental y curas concretas.
- **Clima** con previsión a 5 días y efectos reales: la lluvia corrosiva te quema, la
  ventisca te congela si no llevas abrigo, la tormenta eléctrica fríe tu linterna.
- **Catálogo de objetos abierto.** Los 80 objetos del catálogo base son solo el punto de
  partida: si buscas en un cenicero, el mundo puede crear una colilla concreta, con su peso
  real (10 g, no 300) y su utilidad (arde). Los objetos nuevos se validan, se acotan a rangos
  plausibles, se guardan con la partida y cuentan para la carga como cualquier otro.
- **Fabricación determinista**: 19 recetas con ingredientes, requisitos de habilidad y
  probabilidad de fallo. **El motor consume y produce, no la IA.**
- **Sustitución por clase de material.** Las recetas no piden un objeto concreto sino lo que
  hace falta: *un filo*, *una atadura*, *un adhesivo*. Cualquier cosa que cumpla esa función
  vale — cinta donde pedía pegamento, un machete donde pedía cuchillo — con más riesgo de
  fallo cuanto peor sea el apaño. El manual te dice qué alternativas llevas encima.
- **Improvisación sin receta.** Describes lo que quieres apañar («arranco las mangas de la
  camisa para hacer vendas») y el juego lo arbitra: el modelo decide si la idea se sostiene
  y con qué, el motor tira el dado contra tu habilidad, gasta el material y crea el objeto.
- **Recetas que se aprenden jugando**, no solo de los libros: unas notas en una pared,
  alguien que te lo explica, probar hasta que sale.
- **Refugio** con 7 construcciones: camastro, almacén, huerto, recogida de agua, taller,
  muro y generador. Producen recursos mientras estás fuera; sin muro, te lo saquean.
- **Dormir de verdad**: eliges las horas y el motor resuelve la noche entera — recupera
  sueño según dónde duermas, avanza enfermedades y heridas, y tira el riesgo nocturno según
  el peligro de la zona y lo que hayas construido. El camastro y el muro sirven para esto.
- **Tiradas de habilidad visibles**: cuando la acción implica una habilidad, el motor tira
  `d20 + nivel` contra la dificultad de la zona, lo muestra en el registro y le dice al
  modelo qué tiene que narrar. El modelo cuenta el cómo; el resultado ya está decidido.
- **Mapa procedural** navegable con zonas conectadas, tipos y nivel de peligro. El trazado
  es un relajado de fuerzas: las zonas conectadas se atraen, todas se repelen y una gravedad
  suave mantiene el conjunto compacto, así que sigue cabiendo en pantalla con 60 zonas.
- **Diario** que tu personaje escribe al dormir, y **álbum** de fotos con pie de foto escrito
  en primera persona.
- **Ambiente sonoro procedural** que sigue la tensión de la escena. Sin ficheros de audio:
  todo se sintetiza con la Web Audio API.
- **Muerte real**, con causa, epitafio y resumen de la partida.

### Interfaz

Diseño responsive de verdad: tres columnas en escritorio, dos en tablet y una sola columna
con barra inferior de pestañas en móvil. Navegación por teclado, foco atrapado en los
modales, `prefers-reduced-motion` respetado y atajos (`I` mochila, `C` fabricar, `M` mapa,
`B` refugio, `D` diario, `F` álbum).

---

## Arquitectura

```
src/
├── data/          Contenido puro: objetos, arquetipos, rasgos, recetas, climas, narradores
├── engine/        Reglas del juego. Funciones puras y un único reducer
│   ├── rules.ts       Necesidades, capacidad, habilidades, enfermedades, lesiones
│   ├── world.ts       Clima, mapa procedural, ambiente
│   ├── crafting.ts    Planificar y resolver fabricación
│   ├── suggestions.ts Acciones rápidas según el contexto
│   └── reducer.ts     TODAS las transiciones de estado
├── ai/            Cliente compatible con OpenAI, prompts y validación de respuestas
├── persistence/   Ranuras de guardado, ajustes, almacén de imágenes en IndexedDB
├── components/    Piezas de interfaz reutilizables
├── modals/        Paneles: mochila, fabricación, mapa, refugio, diario, álbum, ajustes
├── screens/       Creación de personaje, partida y muerte
└── styles/        Tokens de diseño y hoja de estilos
```

**La regla de oro:** todo cambio de estado pasa por `engine/reducer.ts` y es una función
pura. La IA propone; el reducer dispone. Eso hace el juego testeable (`npm test` ejecuta
82 comprobaciones sin navegador) y elimina de raíz las condiciones de carrera.

### Cómo añadir cosas

| Quieres… | Toca… |
|---|---|
| un objeto nuevo | `src/data/items.ts` (con `use` si es consumible, `materials` si sustituye) |
| una clase de material | `MATERIAL_CLASSES` en `src/data/items.ts` |
| una receta | `src/data/recipes.ts` |
| un arquetipo | `src/data/archetypes.ts` (necesita nombre para los 5 géneros) |
| un rasgo | `src/data/traits.ts` |
| una enfermedad o un clima | `src/data/conditions.ts` |
| un género entero | `src/data/genres.ts` |
| una regla nueva | una función pura en `src/engine/` + una acción en el reducer |

---

## Qué cambió respecto al prototipo

<details>
<summary><b>Fallos corregidos</b></summary>

- **Clave de API en el código fuente.** Ahora la pone el jugador y se guarda solo en su navegador.
- **Sin pantalla de muerte.** La vida llegaba a 0 y no pasaba nada. Ahora la partida termina
  con causa, últimas palabras y estadísticas.
- **Condiciones de carrera en el estado.** Una misma acción hacía hasta seis `setState`
  distintos sobre la vida, mezclando actualizaciones absolutas y funcionales: los cambios se
  perdían. Ahora un turno es **una** transición atómica.
- **Efectos secundarios dentro de actualizadores de estado.** `setDiseases(prev => { setHp(...) })`
  disparaba efectos duplicados. Eliminado.
- **El guardado reventaba en silencio.** Las imágenes se guardaban como base64 dentro de
  `localStorage` y superaban la cuota. Ahora van a IndexedDB y el estado solo guarda la clave.
- **Fabricación decorativa.** Había base de datos de recetas, sustitutos y probabilidades de
  fallo… que no se usaban: craftear era pedirle a la IA por texto libre. Ahora es determinista.
- **Pérdida permanente de experiencia.** La tormenta de ceniza y la abstinencia restaban XP
  para siempre pese a describirse como temporales. Ahora son modificadores con duración.
- **Tres copias casi idénticas del bucle de turno** (`sendAction`, `sendActionWithText`,
  `sendQuickAction`) con comportamientos distintos: solo una aplicaba los rasgos periódicos y
  el diario. Ahora hay una sola ruta.
- **El género no hacía nada.** Se elegía en la primera pantalla y se ignoraba por completo.
- **Detección de refugio por análisis de texto.** El tornado buscaba palabras como «sótano»
  en lo que habías escrito. Ahora depende del tipo de zona en el mapa.
- **JSON del modelo sin validar.** Un objeto inventado entraba en el inventario y un número
  fuera de rango se aplicaba tal cual. Ahora todo se valida, se acota y se contrasta contra
  el catálogo, con reintento si el JSON viene roto.
- **Errores de red invisibles.** Fallaban en la consola y la partida seguía como si nada.
  Ahora se explican en pantalla y se pueden reintentar o cancelar.
- **Latido de audio que no paraba** al cambiar de ambiente (comparaba funciones en lugar de
  usar un contador de generación).
- **Sin lectura en móvil.** Paneles laterales fijos y texto que no cabía.

</details>

<details>
<summary><b>Añadido</b></summary>

Pantalla de muerte y estadísticas · consumibles con efecto real · curación natural de
lesiones · modificadores temporales · previsión meteorológica · 4 ranuras de guardado con
exportar/importar a fichero · migración de partidas antiguas · sugerencias de acción
escritas por el narrador para la escena concreta · nuevos climas suaves (nublado, lluvia,
niebla) · dos construcciones nuevas (recogida de agua, generador) · materias primas
(chatarra, tela, madera) que hacen coherente la cadena de fabricación · tests del motor ·
TypeScript estricto en todo el proyecto.

</details>

---

## Licencia

MIT. Haz con él lo que quieras.
