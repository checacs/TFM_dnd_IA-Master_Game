# App móvil

**Estado:** v2.0 — actualizado tras el rediseño del sistema de turnos: la app móvil pasó a ser la única superficie desde la que se juega (ui-web es de solo lectura, ver `07-ui-web.md`). Paso 8 original de la hoja de ruta.
**Se apoya en:** `01-especificacion-funcional.md` (HU2-HU5, HU8, HU9), `03-arquitectura-clean-api-nestjs.md`
**Precede a:** CI/CD y E2E (paso 9)

---

## 1. Stack

**React Native + Expo.** Mismo lenguaje y buena parte del conocimiento de tipos/cliente HTTP que la UI web (paso 7) — comparten el mismo contrato REST, incluso podéis compartir el paquete de tipos TypeScript de las respuestas de la API entre `web/` y `mobile/` si montáis un monorepo.

## 2. Pantalla: ficha de personaje + partida en curso (mockup arriba)

Es la única pantalla que ve el jugador mientras la partida está en curso (`CharacterSheetScreen`). Combina la ficha de personaje con los controles de juego:

- Cabecera: nombre, clase, nivel.
- **Panel de combate**: indicador de estado (fase de ronda, de quién es el turno o si soy el capitán fuera de combate), botón **"Mi turno"** (reclama el candado de la ronda de jugadores — solo se habilita si la fase es "jugadores", nadie más lo tiene reclamado y yo no he actuado ya en esta ronda) y botón **"Tirar Dados"** (tirada ad-hoc `1d20` vía `POST /games/:id/player-roll`, no muta la partida).
- **Campo de acción** al fondo de la pantalla: equivale a responder al chat del DM (`POST /games/:id/player-action`). Solo está habilitado si tengo el turno reclamado (en combate) o si soy el capitán del grupo (fuera de combate); al enviar, el turno se libera automáticamente — no hace falta ningún paso extra para "pasar turno".
- HP y CA en tarjetas.
- Barra de progreso de XP hacia el siguiente nivel.
- Aviso de puntos de habilidad disponibles (solo visible si `unassignedSkillPoints > 0` — HU9).
- Lista de atributos con botón "+" junto a cada uno.
- Sección de conjuros y ranuras (solo si `spellcaster: true`, ver `02-modelo-datos-mongodb.md`).

## 3. Contrato con el backend

```
GET  /characters/:id                     → ficha completa
POST /characters/:id/assign-skill-point  → { attribute: 'int' }
GET  /games/:id                          → estado de la partida (roundPhase, turnClaims, captainUserId...)
POST /games/:id/claim-turn               → { characterId }              — botón "Mi turno"
POST /games/:id/player-action            → { characterId, content }    — campo de acción
POST /games/:id/player-roll              → { notation? }               — botón "Tirar Dados" (por defecto "1d20")
```

Cada endpoint es exactamente el caso de uso del mismo nombre del paso 3 (`ClaimTurnUseCase`, `SendPlayerActionUseCase`, `RollDiceUseCase` vía `player-roll`, `LevelUpUseCase` vía `assign-skill-point`) — la app móvil no decide nada, solo llama al caso de uso y refresca desde la respuesta / el siguiente sondeo de `GET /games/:id` (cada 3s mientras la partida no esté `finalizada`).

## 4. Reglas de UI que reflejan invariantes de dominio

- El botón "+" se deshabilita en cuanto `unassignedSkillPoints` llega a 0 — no hace falta que el usuario lo intente y reciba un error, aunque el backend igualmente lo rechazaría (defensa en profundidad).
- Si la clase no es conjuradora, la sección de conjuros no se renderiza en absoluto (no una sección vacía).

## 5. Definición de terminado de este paso

- Tests de componente para el contador de puntos disponibles (no permite bajar de 0 en el cliente).
- La ficha se recarga desde `GET /characters/:id` tras cada asignación de punto — no se actualiza el contador solo de forma optimista sin confirmar con el backend.

---

*Siguiente paso: CI/CD y E2E — pipelines, pirámide de tests y flujo Gitflow para los cuatro proyectos (`api`, `dm-engine`, `web`, `mobile`).*
