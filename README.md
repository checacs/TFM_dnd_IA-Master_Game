# D&D con IA Master

**Máster de Desarrollo con IA — Módulo 12: Proyecto Final**
**Alumno:** Carlos (checacs@gmail.com)
**Fecha de entrega:** 20/07/2026

Juego de rol de mesa (D&D 5e simplificado) en el que una **IA ejerce de Dungeon Master**: narra la historia, genera enemigos y arbitra encuentros, apoyándose siempre en tiradas de dados deterministas que ejecuta el backend — el modelo de lenguaje nunca inventa un resultado numérico. El sistema está formado por 4 proyectos independientes que se despliegan y versionan por separado.

---

## a. Descripción general del proyecto

El proyecto reproduce la experiencia de una partida de rol de mesa (D&D) sustituyendo al Máster humano por un **DM-IA** (DeepSeek), que:

- Narra la historia y decide qué enemigos aparecen, tomándolos de un catálogo real (334 monstruos, 319 hechizos, equipo y objetos mágicos, importados de [dnd5eapi.co](https://www.dnd5eapi.co)).
- Decide *cuándo* hace falta una tirada y su dificultad, pero **nunca calcula el resultado**: toda tirada (ataque, daño, salvación) la ejecuta el backend con un generador de números real, y el DM-IA narra sobre ese resultado, no al revés.
- Gestiona el combate por rondas sin orden de iniciativa fijo entre jugadores: cualquiera puede reclamar su turno con el botón "Mi turno" mientras dure la ronda de jugadores; los enemigos actúan libremente al cierre de la ronda.
- Notifica siempre en el chat lo que ocurre por decisión del DM-IA, no solo por número: si un enemigo huye se anuncia por su nombre, la XP ganada al cerrar un combate aparece como entrada de narrativa, y cada tirada ad-hoc del DM (`roll_dice`) se muestra junto con el motivo por el que se pidió — nada queda oculto en logs internos.

El sistema tiene **tres superficies de cliente** sobre un mismo núcleo de negocio:

- **UI web** (estilo Claude/ChatGPT, estética pergamino): configuración de partida, lobby, y pantalla de juego de **solo lectura** — narración del DM, mapa, roster de jugadores y estado del combate. No se juega desde aquí.
- **App móvil**: única superficie desde la que se actúa — ficha de personaje, progresión (subir de nivel, repartir puntos de habilidad), botón "Mi turno", "Tirar Dados" y el cuadro de texto para dictar la acción del personaje (o hablar con el DM fuera de combate, si eres el capitán del grupo).
- **API REST + servidor MCP**: núcleo de reglas, persistencia (MongoDB) y el conjunto de *tools* que el motor de IA usa para consultar y mutar el estado real de la partida (nunca inventa datos).

Un cuarto componente, **`dm-engine`**, actúa de puente: recibe el turno desde la API, deja que DeepSeek llame a las tools MCP que necesite (tirar dados, resolver ataques, colocar participantes en el mapa, consultar catálogos...) y devuelve la narrativa final ya verificada.

### Por qué este proyecto

Pone en práctica, de principio a fin, los tres bloques centrales del máster: una API con **Clean Architecture** y TDD estricto, un **servidor MCP** real (no un ejemplo de juguete) que expone casos de uso de negocio como *tools*, y un **motor de orquestación de IA** con bucle de tool-calling, reintentos ante huecos de protocolo y límite de iteraciones — sobre un dominio (reglas de D&D) con suficiente profundidad como para que el diseño de puertos, entidades y casos de uso tenga sentido real y no sea un CRUD disfrazado.

---

## b. Stack tecnológico

| Proyecto | Stack |
|---|---|
| **`API_REST TFM`** | NestJS 11 + TypeScript, MongoDB (Mongoose), JWT (Passport), Clean Architecture (dominio / aplicación / infraestructura / interfaz REST+MCP), `@modelcontextprotocol/sdk` para el servidor MCP, **Qwen3-TTS-Flash** (Alibaba Cloud Model Studio, vía `fetch` directo) para texto-a-voz, Jest para TDD |
| **`dm-engine`** | Node + TypeScript, servidor Express mínimo, cliente MCP propio contra la API, OpenAI SDK apuntando al endpoint compatible de **DeepSeek** (`DEEPSEEK_BASE_URL` configurable — el mismo cliente funciona sin cambios contra Kimi K2/K3 u otro proveedor compatible con la SDK de OpenAI) |
| **`ui-web`** | React 19 + TypeScript + Vite, TanStack Query (estado servidor / polling), React Router |
| **`mobile-app`** | React Native + Expo (TypeScript), React Navigation, TanStack Query, AsyncStorage (sesión JWT), builds nativos vía **EAS Build** |
| **Base de datos** | MongoDB |
| **Despliegue** | Render (API y dm-engine, como Web Services), Vercel (ui-web), EAS Build + distribución directa del APK (mobile-app) |

---

## c. Instalación y ejecución

Cada proyecto es un repositorio independiente con su propio `package.json`. Orden recomendado de arranque en local: `API_REST TFM` → `dm-engine` → `ui-web` / `mobile-app`.

### `API_REST TFM` (backend + servidor MCP)

```bash
cd API_REST TFM
cp .env.example .env    # rellena MONGODB_URI, JWT_SECRET, DM_ENGINE_URL
npm install
npm test                 # TDD: casos de uso de dominio/aplicación con fakes (FakeDiceRoller, etc.)
npm run start             # http://localhost:3000
```

Catálogos de referencia (opcional, para tener contenido con el que jugar):

```bash
npm run seed:users
npm run seed:maps
npm run import:monsters
npm run import:spells
npm run import:rules-reference
npm run import:equipment
npm run import:magic-items
```

Voz clonada (opcional, ver `QWEN_TTS_CLONED_VOICE_ID` en `.env.example`):

```bash
npm run clone-voice -- assets/voice-samples/mi-voz.wav
```

### `dm-engine` (motor IA del Dungeon Master)

```bash
cd dm-engine
cp .env.example .env    # rellena DEEPSEEK_API_KEY, DEEPSEEK_MODEL, MCP_SERVER_URL
npm install
npm test
npm run start             # http://localhost:4000 — necesita la API ya arrancada
```

### `ui-web` (interfaz web, solo lectura)

```bash
cd ui-web
npm install
npm run dev                # http://localhost:5173 — espera la API en http://localhost:3000
```

### `mobile-app` (app móvil, superficie de juego)

```bash
cd mobile-app
npm install
npx expo start
```

`localhost` en el móvil apunta al propio dispositivo, no al ordenador con el backend — hay que pasar la IP real:

```bash
EXPO_PUBLIC_API_URL=http://TU_IP_LOCAL:3000 npx expo start
```

Para generar el instalable de Android (usado para la entrega, ver sección de despliegue):

```bash
eas build --platform android --profile preview
```

---

## d. Estructura del proyecto

Nombres reales de las carpetas de este repo (los documentos 01-10 usan los nombres genéricos `api/`, `web/`, `mobile/` del diseño original — la tabla de abajo es el mapeo a como se llaman de verdad):

```
API_REST TFM/   NestJS + MongoDB — dominio, aplicación, infraestructura, interfaz REST + MCP (doc 03-04)
  src/
    domain/            entidades (Character, Game, User...), value objects, puertos
    application/        casos de uso (uno por acción de negocio), tests TDD junto a cada caso de uso
    infrastructure/      Mongoose, bcrypt, JWT, Qwen3-TTS-Flash
    interface/
      http/              controladores REST (auth, games, characters, tts)
      mcp/                tools MCP que envuelven los mismos casos de uso que REST

dm-engine/       Cliente MCP propio + DeepSeek — orquesta al Dungeon Master IA (doc 05)
  src/
    server.ts             servidor Express, endpoint /turn
    mcp-tool-caller.ts     cliente MCP contra la API
    deepseek-chat-client.ts
    dm-turn.ts             bucle de tool-calling + protocolNudge (reintento ante huecos de protocolo)
    dm-system-prompt.ts

ui-web/          UI estilo chat + tablero, de solo lectura (React + Vite) (doc 07)
  src/
    screens/               Login, GameSetup, Lobby, GameScreen
    api/                   cliente HTTP + hooks TanStack Query

mobile-app/       App móvil — única superficie de juego (React Native + Expo) (doc 08)
  src/
    screens/               LoginScreen, GameListScreen, GameDetailScreen, CharacterSheetScreen
    api/                   cliente HTTP + hooks
    auth/                  sesión JWT (AsyncStorage)
    navigation/             stack de React Navigation

docs/             Documentación de diseño spec-driven (01 a 10, ver tabla más abajo)
.skills/           Convenciones del repo (reglas de combate, TDD estricto, convenciones MCP)
```

Cada uno de los cuatro proyectos de código tiene su propio `README.md` con instrucciones de arranque y el estado real de lo implementado — este README raíz se queda en la vista de alto nivel.

### Documentación de diseño (spec-driven)

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

---

## e. Funcionalidades principales

- **Autenticación con JWT**, sin registro público — las cuentas las crea un administrador (endpoint `POST /auth/users`, protegido) o el script de siembra. Un admin puede además resetear la contraseña de cualquier usuario (`PATCH /auth/users/:id/password`).
- **Creación y gestión de partidas**: crear partida (1–4 jugadores), unirse por código, sala de espera, lanzar partida.
- **Ficha de personaje**: atributos, HP, CA, barra de XP, hechizos/ranuras si es conjurador, inventario — con progresión real (niveles 1–5, puntos de habilidad asignables, umbrales de XP).
- **Economía e inventario**: moneda por personaje (oro/plata/cobre), objetos y objetos mágicos otorgados por el DM-IA (`grant_item`, `grant_magic_item`, `grant_currency`), compra en el catálogo de equipo (`buy_item`) y armadura equipable con efecto real en la CA.
- **Narración con IA real**: el jugador capitán del grupo escribe libremente y recibe respuesta narrativa del DM-IA (DeepSeek) fuera de combate.
- **Combate por rondas sin iniciativa fija**: candado de turno ("Mi turno") entre jugadores; los enemigos los resuelve el DM-IA al cierre de ronda. Tiradas de ataque/daño/salvación siempre ejecutadas por el backend.
- **Tablero táctico**: mapas de combate reales con zonas, y marcadores de posición de jugadores/enemigos sincronizados por el DM-IA vía la tool `place_participant`. La partida arranca siempre con la vista general del pueblo hasta que el grupo elige taberna o tablón de anuncios.
- **Avisos garantizados en el chat**: huida de un enemigo, XP ganada al cerrar combate y cada tirada ad-hoc del DM aparecen como entradas de narrativa visibles para los jugadores, con el motivo de la tirada incluido — no solo en logs de servidor.
- **Cambio de capitán**: el grupo puede reasignar quién habla con el DM fuera de combate.
- **Narración por voz (TTS) con clonación de voz**: síntesis de la narración del DM con **Qwen3-TTS-Flash**, reproducible desde `ui-web`. Opcionalmente, se puede clonar una voz real a partir de una muestra de audio propia (`npm run clone-voice`, ver `scripts/clone-voice.ts`) y usarla como voz por defecto en vez de las del catálogo — `QwenTtsService` cambia de modelo automáticamente al modelo VC (voice-cloning) dedicado de Qwen solo para esa voz.
- **Servidor MCP real** (no un ejemplo de juguete): 26 tools que exponen los mismos casos de uso de dominio que la API REST, verificables con el Inspector oficial de MCP.
- **TDD estricto** en dominio y aplicación: cada caso de uso tiene su test con dobles (`FakeDiceRoller`, `FakeUserRepository`...) escrito antes que la implementación.

---

## f. Usuario y contraseña de prueba

La API no permite registro público — estas cuentas ya existen en la base de datos de producción:

| Usuario | Contraseña | Rol |
|---|---|---|
| `carlos` | `@rquimed3s` | admin |
| `sergio@mail.com` | `S3rgi0` | jugador |
| `sandra@mail.com` | `S@ndra83` | jugador |
| `checa@mail.com` | `Ch3k@81` | jugador |

Cualquiera de las cuatro sirve para entrar tanto en `ui-web` como en `mobile-app`. Para probar el flujo completo con varios jugadores en la misma partida (crear personaje, sala de espera, turnos), se recomienda usar dos cuentas a la vez desde dos sesiones distintas.

---

## Repositorios de código fuente

El proyecto se reparte en 4 repositorios públicos independientes:

| Repositorio | Contenido |
|---|---|
| [dnd5e-DM_IA](https://github.com/checacs/dnd5e-DM_IA) | `API_REST TFM` — API REST + servidor MCP (núcleo de dominio y reglas) |
| [dm-engine-dnd](https://github.com/checacs/dm-engine-dnd) | `dm-engine` — motor de orquestación del DM-IA |
| [ui-web](https://github.com/checacs/ui-web) | Interfaz web de solo lectura |
| [app-mobile_dnd](https://github.com/checacs/app-mobile_dnd) | App móvil — única superficie de juego |

---

## Despliegue / acceso al proyecto real

| Componente | Acceso |
|---|---|
| **UI web** | https://ui-web-three.vercel.app/login (Vercel) |
| **API REST + MCP** | https://api-dnd5e-dm-ia.onrender.com (Render) |
| **dm-engine** | Desplegado en Render como servicio interno — solo lo consume la API, sin acceso público directo |
| **App móvil** | APK para Android descargable directamente: https://drive.google.com/file/d/1DON39_zIl3KlFrOcQA-AAh22GQV9gRrx/view?usp=sharing |

> Nota sobre el APK: en algunos dispositivos Xiaomi/MIUI, la instalación de APKs fuera de Play Store requiere desactivar "Optimización de MIUI" en Opciones de desarrollador antes de instalar.

---

## Slides y vídeo

- **Slides:** adjuntas en este repositorio — `DND-IA-Master-TFM.pptx` (borrador; sustituir por la URL pública si se sube a Google Slides/Canva)
- **Vídeo explicativo:** _[pendiente de añadir — URL del vídeo con captura de pantalla]_

---

## Créditos

Proyecto individual desarrollado como Trabajo de Fin de Máster — Máster de Desarrollo con IA (BIG School). Catálogo de monstruos, hechizos, equipo y reglas de referencia importado de la [D&D 5e API](https://www.dnd5eapi.co) (contenido abierto bajo licencia OGL/CC).

---

## Puntos a vigilar en la implementación

Detectados durante el diseño, antes de que exista código — revisar al llegar a cada pieza:

- **Servidor MCP (04):** verificar el id exacto del modelo de DeepSeek vigente en `api-docs.deepseek.com` antes de desplegar — cambia con frecuencia, no asumir el usado en este documento.
- **Motor IA - DM (05):** el bucle de tool-calling necesita un límite máximo de iteraciones, para que un fallo del modelo no lo deje llamando tools indefinidamente.
- **Arquitectura Clean (03):** configurar `@nestjs/swagger` y entregar el contrato OpenAPI generado — no es opcional para este proyecto.
- **Autenticación (10):** el caso de uso que arranca la sesión de juego se llama `LaunchGameUseCase`, no `StartGameUseCase` — para no confundirlo con la tool MCP `start_combat`, que resuelve un combate dentro de una partida ya iniciada.
- **Autenticación (10):** `LevelUpUseCase` (definido en el paso 03, antes de que existiera `ownerId`) necesita añadir la comprobación de que el personaje pertenece al usuario autenticado — es un hueco de seguridad detectado retroactivamente al diseñar el paso 10, no estaba en el diseño original.

## Cómo seguir trabajando en este repo

Antes de tocar código, lee el `agents.md` de la raíz — es el índice de convenciones. Para cambios de arquitectura, el documento del paso correspondiente es la fuente de verdad; si algo va a cambiar respecto a lo documentado, decirlo explícitamente en vez de reescribir en silencio.
