---
name: convenciones-mcp-tools
description: Usa esta skill cuando añadas, elimines o modifiques una tool del servidor MCP en interface/mcp/. No la cargues para cambios que solo toquen REST o el dominio sin afectar al contrato MCP.
---

# Convenciones para tools del servidor MCP

Referencia razonada: `docs/04-servidor-mcp.md`.

## Antes de añadir una tool nueva, comprueba

1. **¿Quién decide ejecutar esta acción, el jugador o el DM-IA?** Si es el jugador, no es una tool MCP — va solo por REST. Ver tabla de decisión en `docs/04-servidor-mcp.md` sección 1.
2. **¿Ya existe un caso de uso de `application/` que hace esto?** Si no, créalo ahí primero — la tool nunca contiene lógica, solo traduce.

## Nomenclatura y forma
- Nombre de la tool: `snake_case`, verbo + objeto (`resolve_attack`, `grant_xp`, `get_game_state`).
- Descripción de la tool (el texto que lee el LLM): imperativa, dice cuándo usarla y qué NO debe asumir el modelo. Ejemplo real del proyecto:
  > "Busca enemigos del catálogo maestro por etiquetas o dificultad. Úsalo siempre antes de introducir un enemigo en la narración: nunca inventes sus estadísticas."
- Esquema de entrada: Zod, con las mismas restricciones que el DTO REST equivalente si existe (mismo rango, mismo formato de notación de dados, etc.) — no relajar validación solo porque el cliente ahora es un LLM.

## Al registrar la tool
- El handler vive en `game-mcp-tools.ts`, es una función de una línea que llama al caso de uso.
- Si la tool debe reflejarse en la UI en tiempo real, añade su mapeo a la tabla de eventos de `docs/05-motor-ia-dm-deepseek.md` sección 4 — una tool nueva sin evento asociado es una tool "muda" para la UI (válido solo para tools de solo lectura como `get_game_state`).

## Checklist antes de dar por terminada una tool nueva
- [ ] Existe el caso de uso en `application/` con sus tests (ver skill `tdd-estricto`).
- [ ] La tool está registrada y aparece en `tools/list` (verificable con el inspector de MCP).
- [ ] Si muta estado, tiene un evento correspondiente documentado.
- [ ] Test de integración: la tool invoca el caso de uso correcto con los argumentos correctos.
