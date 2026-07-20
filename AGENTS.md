# AGENTS.md

## Visión general del proyecto

**D&D con IA Master** — juego de rol en el que una IA ejerce de Dungeon Master, apoyada en tiradas deterministas ejecutadas por el backend. Componentes:

- `API_REST TFM/` — NestJS + TypeScript + MongoDB, Clean Architecture (dominio, aplicación, infraestructura, interfaz REST + MCP).
- `dm-engine/` — cliente MCP propio + DeepSeek API, orquesta al Dungeon Master IA.
- `ui-web/` — React 19 + TypeScript + Vite + TanStack Query + React Router (chat + tablero).
- `mobile/` — ficha de personaje y progresión (pendiente, paso 8).

## Documentación viva

Toda decisión de arquitectura está en `/docs/`, numerada por paso de la hoja de ruta:

```
docs/
  01-especificacion-funcional.md
  02-modelo-datos-mongodb.md
  03-arquitectura-clean-api-nestjs.md
  04-servidor-mcp.md
  05-motor-ia-dm-deepseek.md
  07-ui-web.md
  08-app-movil.md
  09-cicd-e2e.md
  10-autenticacion-y-lobby.md
```

**Antes de proponer un cambio de arquitectura, lee el documento del paso correspondiente.** Si el cambio contradice lo ya decidido, dilo explícitamente en vez de reescribir silenciosamente.

## Stack confirmado

- Backend: NestJS + TypeScript + MongoDB (Mongoose)
- IA: DeepSeek (API compatible con OpenAI, function calling) + SDK oficial de MCP (TypeScript)
- UI web: React 19 + TypeScript + Vite + TanStack Query + React Router
- Reglas del juego: D&D 5e simplificado, niveles 1-5 en el MVP

## Convenciones de nomenclatura

- Archivos: `kebab-case` (ej. `resolve-attack.use-case.ts`)
- Clases: `PascalCase`
- Puertos de dominio: sufijo `.port.ts`; token de inyección en `UPPER_SNAKE_CASE` (ej. `DICE_ROLLER`, `GAME_REPOSITORY`)
- Tools MCP: `snake_case` (convención del propio protocolo, ej. `resolve_attack`, `get_enemy_catalog`)

## Regla de dependencia (innegociable)

`domain/` no importa nada de `@nestjs/*`, `mongoose`, del SDK de MCP, ni de DeepSeek. Las flechas de dependencia solo apuntan hacia el dominio. Ningún controlador REST ni handler de tool MCP contiene lógica de negocio — solo traducen su formato de entrada a la llamada de un caso de uso.

## Protocolo de testing

- TDD estricto: Red → Green → Refactor. Ningún caso de uso se implementa sin su test primero.
- Ejecutar `npm run test` tras cualquier cambio en `domain/` o `application/` antes de dar la tarea por terminada.
- Toda lógica que dependa de aleatoriedad (dados) se testea con `FakeDiceRoller`, nunca con el generador real.

## Índice de skills

Este archivo es un índice, no un manual — el detalle vive en skills que se cargan solo cuando la tarea las necesita:

- `.skills/reglas-combate-dnd/SKILL.md` — mecánica de combate, tiradas, progresión de nivel
- `.skills/tdd-estricto/SKILL.md` — cómo aplicar TDD en este proyecto concreto
- `.skills/convenciones-mcp-tools/SKILL.md` — cómo diseñar y nombrar una tool MCP nueva

## Definición de terminado (global)

- Tests en verde, incluyendo los deterministas de combate/dados.
- Sin lógica de negocio fuera de `domain/` y `application/`.
- `/docs/` actualizado si la tarea implica una decisión de arquitectura nueva o distinta a la ya documentada.
