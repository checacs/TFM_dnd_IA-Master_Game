# UI web

**Estado:** v2.0 — actualizado tras el rediseño del sistema de turnos (ui-web pasó a ser de solo lectura; ver nota abajo). Paso 7 original de la hoja de ruta.
**Se apoya en:** `03-arquitectura-clean-api-nestjs.md`, `05-motor-ia-dm-deepseek.md`
**Precede a:** app móvil (paso 8)

---

**Cambio importante sobre el diseño original:** tras revisar el sistema de turnos con la experiencia real de partidas de rol de mesa, se decidió que jugar (escribir al DM, atacar, reclamar turno, tirar dados) pasa a ser exclusivo de la app móvil. ui-web se convirtió en una pantalla **de solo lectura**: muestra la narración del DM (y el eco de lo que escribió cada jugador), el mapa, los jugadores y el estado del combate (fase de ronda, quién tiene el turno), pero ya no tiene campo de texto ni botón de atacar. El resto de esta sección describe el diseño original tal cual se escribió — se deja como referencia histórica salvo donde se indica lo contrario.

## 1. Stack

**React + TypeScript + Vite.** Para el estado remoto, TanStack Query sobre `fetch` contra la API REST del paso 3 — nada de Redux, el estado de la partida vive en el servidor, no en el cliente.

**Sin WebSockets, con sondeo (polling) continuo.** Como ui-web ya no dispara ninguna acción de juego (eso ahora vive en el móvil, potencialmente en otro dispositivo), no puede resolver nada "dentro de la misma petición HTTP" como preveía el diseño original — `useGame` sondea la partida cada 3s mientras no esté `finalizada`, y así refleja la narración y el combate que otro jugador está generando desde su móvil. Ver en tiempo real de verdad (sin sondeo) seguiría siendo una mejora futura vía WebSockets, no un requisito.

## 2. Pantallas (mockups arriba)

### 2.1 Configuración de partida
Selector de número de jugadores (1-4, selección única), nombre de partida, botón de inicio deshabilitado hasta que ambos campos sean válidos (HU1). El host puede además elegir aquí quién es el capitán del grupo entre los jugadores ya unidos.

### 2.2 Pantalla de juego (solo lectura)
División 50/50: panel de narración a la izquierda (DM + eco de jugadores, sin campo de texto), tablero + enemigos a la derecha, con un indicador de fase de ronda ("jugadores"/"enemigos") y de quién tiene el turno reclamado. Sin botón de atacar ni panel de dados — eso vive en el móvil.

## 3. Componentes

```
src/
  screens/
    GameSetupScreen.tsx
    GameScreen.tsx
  components/
    setup/
      PlayerCountSelector.tsx
      GameNameInput.tsx
    game/
      ChatPanel.tsx
      BoardPanel.tsx
      EnemyPanel.tsx
      DiceRollPanel.tsx
      SaveGameButton.tsx
  hooks/
    useCreateGame.ts        # POST /games
    useSendAction.ts        # POST /games/:id/message | /attack | /roll-dice
    useSaveGame.ts           # POST /games/:id/save
```

## 4. Contrato con el backend

Cada acción del jugador (mensaje libre, atacar, tirar dados) devuelve la misma forma de respuesta, ya definida en el paso 5:

```ts
interface ActionResponse {
  narrative: string;       // texto para el ChatPanel
  events: GameEvent[];     // combate_iniciado | ataque_resuelto | tirada_realizada | xp_otorgada
}
```

`BoardPanel` y `EnemyPanel` no mantienen estado propio complejo: se derivan de los eventos recibidos con un reducer simple (`combate_iniciado` puebla el tablero y la lista de enemigos; `ataque_resuelto` actualiza HP; etc.) — la tabla completa de eventos está en `05-motor-ia-dm-deepseek.md`, sección 4.

## 5. Definición de terminado de este paso

- `GameSetupScreen` no permite iniciar partida con datos inválidos (validación de cliente espejo de la validación del DTO REST).
- `BoardPanel`/`EnemyPanel` se actualizan solo a partir de `events`, nunca infieren estado por su cuenta.
- Tests de componente (React Testing Library) para el reducer de eventos, no solo para el renderizado.

---

*Siguiente paso: app móvil — ficha de personaje y progresión (HU8, HU9).*
