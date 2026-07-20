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

Nombres reales de las carpetas (los documentos 01-10 usan los nombres genéricos `api/`, `web/`, `mobile/` del diseño original):

```
API_REST TFM/  Este proyecto — NestJS + MongoDB, dominio/aplicación/infraestructura/interfaz REST + MCP
dm-engine/     Cliente MCP propio + DeepSeek — orquesta al Dungeon Master IA
ui-web/        UI estilo chat + tablero (React + Vite)
mobile-app/    App móvil — login, partidas, ficha de personaje (React Native + Expo)
docs/          Esta documentación (01-10)
.skills/
  reglas-combate-dnd/
  tdd-estricto/
  convenciones-mcp-tools/
```

## Guía rápida de comandos

### Arranque

```bash
# api/
cp .env.example .env    # rellena MONGODB_URI, JWT_SECRET, DM_ENGINE_URL
npm install
npm test
npm run start            # http://localhost:3000

# dm-engine/ (en otra terminal)
cp .env.example .env    # rellena DEEPSEEK_API_KEY, DEEPSEEK_MODEL, MCP_SERVER_URL
npm install
npm test
npm run start            # http://localhost:4000
```

### Sembrar e importar catálogos (`api/`)

```bash
npm run seed:users              # cuentas de jugador — edita scripts/seed-users.ts antes
npm run seed:maps               # mapas de combate — copia las imágenes a assets/maps/ antes
npm run import:monsters         # 334 monstruos de dnd5eapi.co
npm run import:spells           # 319 hechizos de dnd5eapi.co
npm run import:rules-reference  # condiciones + habilidades + tipos de daño
npm run import:equipment        # armas, armaduras, objetos de aventurero
npm run import:magic-items      # objetos mágicos
```

### Autenticación (PowerShell)

```powershell
$loginBody = @{ username = "tu-usuario"; password = "tu-contraseña" } | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$token = $loginResponse.token
```

Todas las peticiones a `/games/*` y `/characters/*` necesitan `-Headers @{ Authorization = "Bearer $token" }` (con la palabra `Bearer` delante, si no da 401).

### Flujo completo de una partida (PowerShell)

```powershell
# 1. Crear partida
$game = Invoke-RestMethod -Uri "http://localhost:3000/games" -Method Post `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" `
  -Body (@{ name = "La torre olvidada"; maxPlayers = 4 } | ConvertTo-Json)
$gameId = $game.gameId

# 2. Unirse (repetir por cada jugador, con su propio $token)
Invoke-RestMethod -Uri "http://localhost:3000/games/$gameId/join" -Method Post `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" `
  -Body (@{ characterName = "Elyndra"; characterClass = "mago" } | ConvertTo-Json)

# 3. Lanzar la partida (solo el host)
Invoke-RestMethod -Uri "http://localhost:3000/games/$gameId/launch" -Method Post `
  -Headers @{ Authorization = "Bearer $token" }

# 4. Ver el estado
Invoke-RestMethod -Uri "http://localhost:3000/games/$gameId" -Method Get `
  -Headers @{ Authorization = "Bearer $token" }

# 5. Mensaje libre al DM-IA — dispara la llamada real api → dm-engine → DeepSeek
$body = @{ messages = @(@{ role = "user"; content = "Entro en la taberna y miro alrededor" }) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "http://localhost:3000/games/$gameId/message" -Method Post `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $body
```

### Servidor MCP — Inspector oficial

```bash
npx @modelcontextprotocol/inspector
```

En la interfaz: **Transport Type → Streamable HTTP**, **URL → `http://localhost:3000/mcp`**, **Connection Type → Direct** (si "Via Proxy" da error de conexión). Pestaña **Tools** para ver las 16 tools registradas (incluye `place_participant`, para tracking de posición en el tablero) y probarlas a mano.

Para comprobar `tools/list` sin el Inspector:

```powershell
$body = @{ jsonrpc = "2.0"; id = 1; method = "tools/list"; params = @{} } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/mcp" -Method Post `
  -Headers @{ "Accept" = "application/json, text/event-stream" } -ContentType "application/json" -Body $body
```

### `dm-engine` — probar `/turn` directamente (sin pasar por `api`)

```powershell
$body = @{ gameId = "TU_GAME_ID"; messages = @(@{ role = "user"; content = "Entro en la taberna y miro alrededor" }) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "http://localhost:4000/turn" -Method Post -ContentType "application/json" -Body $body
```

Necesita un `gameId` real (creado previamente contra `api`) — `dm-engine` lo usa para llamar a `get_game_state` y al resto de tools vía MCP.

## Puntos a vigilar en la implementación

Detectados durante el diseño, antes de que exista código — revisar al llegar a cada pieza:

- **Servidor MCP (04):** verificar el id exacto del modelo de DeepSeek vigente en `api-docs.deepseek.com` antes de desplegar — cambia con frecuencia, no asumir el usado en este documento.
- **Motor IA - DM (05):** el bucle de tool-calling necesita un límite máximo de iteraciones, para que un fallo del modelo no lo deje llamando tools indefinidamente.
- **Arquitectura Clean (03):** configurar `@nestjs/swagger` y entregar el contrato OpenAPI generado — no es opcional para este proyecto.
- **Autenticación (10):** el caso de uso que arranca la sesión de juego se llama `LaunchGameUseCase`, no `StartGameUseCase` — para no confundirlo con la tool MCP `start_combat`, que resuelve un combate dentro de una partida ya iniciada.
- **Autenticación (10):** `LevelUpUseCase` (definido en el paso 03, antes de que existiera `ownerId`) necesita añadir la comprobación de que el personaje pertenece al usuario autenticado — es un hueco de seguridad detectado retroactivamente al diseñar el paso 10, no estaba en el diseño original.

## Cómo seguir trabajando en este repo

Antes de tocar código, lee el `agents.md` de la raíz — es el índice de convenciones. Para cambios de arquitectura, el documento del paso correspondiente es la fuente de verdad; si algo va a cambiar respecto a lo documentado, decirlo explícitamente en vez de reescribir en silencio.