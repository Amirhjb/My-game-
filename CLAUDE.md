# Notas para trabajar en este repositorio

## Qué es
`Último Relato`: juego narrativo de supervivencia en español, React + TypeScript + Vite.
Un modelo de lenguaje narra; el motor local decide las consecuencias.

## Comandos
```bash
npm run dev      # servidor de desarrollo
npm test         # pruebas del motor (sin navegador, ~1 s)
npm run check    # tipos + pruebas + build — pásalo antes de dar nada por terminado
```

## Reglas del proyecto

1. **Todo cambio de estado va en `src/engine/reducer.ts`.** No hay `useState` con estado de
   partida repartido por los componentes. Si necesitas una regla nueva: función pura en
   `src/engine/`, acción en el reducer, prueba en `tests/engine.test.ts`.

2. **La IA propone, el motor dispone.** Nada de lo que devuelve el modelo se aplica sin pasar
   por `src/ai/schema.ts`: nombres contrastados contra el catálogo, números acotados,
   enumerados validados. Si una mecánica se puede resolver localmente (fabricar, consumir,
   construir), se resuelve localmente.
   Esto incluye los objetos que el mundo inventa: el modelo propone nombre, peso y
   etiquetas, y `asNewItems` los acota a rangos plausibles o cae en `estimateItem`.
   Lo mismo con la improvisación: el modelo juzga si la idea se sostiene, el motor tira
   el dado y consume los materiales.

3. **La clave de API va en `.env.local`, nunca en un fichero versionado.** El repositorio es
   público: una clave commiteada la detecta GitHub y el proveedor la revoca sola. `.env.local`
   se compila dentro de `jugar.html` (así la partida arranca sin escribir nada) pero no se sube.
   Ajustes sigue permitiendo sobreescribirla por navegador.

4. **Las imágenes van a IndexedDB** (`src/persistence/imageStore.ts`), nunca al estado ni a
   `localStorage`: el estado solo guarda la clave.

5. **El aleatorio se inyecta.** Las funciones del motor reciben `rng: () => number` para que
   las pruebas sean deterministas. No llames a `Math.random()` dentro de `src/engine/`.

6. **Colores solo con los tokens** de `src/styles/tokens.css`. Todo deriva de `--h` (el tono
   del género activo). Nada de valores hex sueltos en los componentes.

7. **Texto en español**, incluidos comentarios y mensajes de commit.

## Dónde está cada cosa
- Contenido (objetos, arquetipos, rasgos, recetas, climas): `src/data/`
- Catálogo dinámico: `state.customItems` + `getItem(name, catalogo)` en `src/data/items.ts`
- Clases de material (lo que permite cinta en vez de pegamento): `MATERIAL_CLASSES` en
  `src/data/items.ts`, resueltas en `src/engine/crafting.ts`
- Reglas puras: `src/engine/rules.ts`, `world.ts`, `crafting.ts`
- Prompts y validación: `src/ai/`
- Interfaz: `src/components/`, `src/modals/`, `src/screens/`
