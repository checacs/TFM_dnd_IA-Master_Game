# D&D con IA Master

Juego de rol en el que una IA ejerce de Dungeon Master, apoyada en tiradas deterministas ejecutadas por el backend. Proyecto final del máster — NestJS + MongoDB + DeepSeek + MCP, con UI web, app móvil y arquitectura Clean de principio a fin.

## Documentación (hoja de ruta spec-driven)

| # | Documento | Contenido |
|---|---|---|
| 01 | [Especificación funcional](./01-especificacion-funcional.md) | Reglas de D&D 5e simplificado, historias de usuario, alcance del MVP |
| 02 | [Modelo de datos MongoDB](./02-modelo-datos-mongodb.md) | Esquemas de `characters`, `enemies`, `games` |
| 03 | [Arquitectura Clean de la API (NestJS)](./03-arquitectura-clean-api-nestjs.md) | Dominio, casos de uso, puertos, TDD con `FakeDiceRoller` |
| 04 | [Servidor MCP](./04-servidor-mcp.md) | Tools que envuelven los casos de uso para el motor de IA |
| 05 | [Motor IA - DM (DeepSeek)](./05-motor-ia-dm-deepseek.md) | Cliente MCP propio, bucle de tool-calling, system prompt |
| 06 | [`agents.md` + skills](./agents.md) | Convenciones del repo e índice de skills |
| 07 | [UI web](./07-ui-web.md) | Stack, pantallas, contrato de eventos con el backend |
| 08 | [App móvil](./08-app-movil.md) | Ficha de personaje, progresión, contrato de nivel |
| 09 | [CI/CD y E2E](./09-cicd-e2e.md) | Pipeline, pirámide de tests, Gitflow |
| 10 | [Autenticación y lobby](./10-autenticacion-y-lobby.md) | Usuarios, sala de espera, ownership de personajes |

## Estructura del repositorio

Nombres reales de las carpetas de este repo (los documentos 01-10 usan los nombres genéricos `api/`, `web/`, `mobile/` del diseño original — la tabla de abajo es el mapeo a como se llaman de verdad):

```
API_REST TFM/  NestJS + MongoDB — dominio, aplicación, infraestructura, interfaz REST + MCP (doc 03-04)
dm-engine/     Cliente MCP propio + DeepSeek — orquesta al Dungeon Master IA (doc 05)
ui-web/        UI estilo chat + tablero (React + Vite) (doc 07)
mobile-app/    App móvil — login, partidas, ficha de personaje (React Native + Expo) (doc 08)
docs/          Esta documentación (01-10)
.skills/
  reglas-combate-dnd/
  tdd-estricto/
  convenciones-mcp-tools/
```

Cada uno de los cuatro proyectos de código tiene su propio `README.md` con instrucciones de arranque y el estado real de lo implementado — este README raíz se queda en la vista de alto nivel y el mapeo a la documentación.

## Puntos a vigilar en la implementación

Detectados durante el diseño, antes de que exista código — revisar al llegar a cada pieza:

- **Servidor MCP (04):** verificar el id exacto del modelo de DeepSeek vigente en `api-docs.deepseek.com` antes de desplegar — cambia con frecuencia, no asumir el usado en este documento.
- **Motor IA - DM (05):** el bucle de tool-calling necesita un límite máximo de iteraciones, para que un fallo del modelo no lo deje llamando tools indefinidamente.
- **Arquitectura Clean (03):** configurar `@nestjs/swagger` y entregar el contrato OpenAPI generado — no es opcional para este proyecto.
- **Autenticación (10):** el caso de uso que arranca la sesión de juego se llama `LaunchGameUseCase`, no `StartGameUseCase` — para no confundirlo con la tool MCP `start_combat`, que resuelve un combate dentro de una partida ya iniciada.
- **Autenticación (10):** `LevelUpUseCase` (definido en el paso 03, antes de que existiera `ownerId`) necesita añadir la comprobación de que el personaje pertenece al usuario autenticado — es un hueco de seguridad detectado retroactivamente al diseñar el paso 10, no estaba en el diseño original.

## Cómo seguir trabajando en este repo

Antes de tocar código, lee el `agents.md` de la raíz — es el índice de convenciones. Para cambios de arquitectura, el documento del paso correspondiente es la fuente de verdad; si algo va a cambiar respecto a lo documentado, decirlo explícitamente en vez de reescribir en silencio.
