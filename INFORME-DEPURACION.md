# Informe de depuración — D&D con IA Master (TFM)

Fecha: 11/09/2026 · Alcance: los cuatro subproyectos del monorepo (`API_REST TFM`, `dm-engine`, `ui-web`, `mobile-app`) más la documentación.

## 1. Cómo se ha trabajado y verificado

El repositorio local estaba en el mismo commit que GitHub (`3a5a16b`), con un único cambio sin commitear (`GameSetupScreen.tsx`, mínimo 2 jugadores), que se ha conservado. La revisión se hizo en cuatro frentes en paralelo (dominio/aplicación de la API, infraestructura/MCP/seguridad de la API, dm-engine y los dos clientes), cada hallazgo crítico se comprobó leyendo el código de punta a punta, y al final una revisión independiente del diff completo encontró cinco problemas más en los propios cambios, que también se corrigieron.

En el entorno de trabajo el registro de npm estaba bloqueado por la política de red, así que no se pudo hacer `npm install`. Para no trabajar a ciegas se montó un ejecutor compatible con Jest (ts-node + stubs mínimos de `@nestjs/common`) que ejecuta los specs reales del proyecto. Cada corrección se hizo con TDD: primero el test en rojo contra el código original, después el arreglo.

| | Antes | Después |
|---|---|---|
| Tests API (dominio, aplicación e infraestructura sin dependencias nativas) | 420 en verde | **483 en verde** |
| Tests dm-engine | 37 en verde | **47 en verde** |
| `tsc` de `domain/` + `application/` | limpio | limpio |
| `tsc` del resto (con stubs de librerías) | — | sin errores nuevos |

Los dos specs que usan `bcrypt` y `@nestjs/jwt` no se pudieron ejecutar aquí (no se tocaron). **Antes de commitear, ejecuta `npm test` en `API_REST TFM` y en `dm-engine` en tu máquina**, y arranca los cuatro proyectos en local una vez: el cableado de NestJS, Express y el SDK de MCP se ha revisado a mano, pero solo tu entorno lo compila contra las librerías reales.

## 2. Lo que tienes que hacer tú

1. **Ejecutar `depuracion-limpieza.ps1`** desde la raíz del repo. Borra los 19 archivos muertos y deja de versionar las carpetas `.idea` y `ui-web/.env.production` (sin borrarlas del disco).
2. **`npm test` en `API_REST TFM` y `dm-engine`**, y probar una partida en local.
3. **Definir `INTERNAL_API_KEY` en Render, con el mismo valor en la API y en dm-engine.** Genera uno con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Si solo lo pones en uno de los dos servicios, el DM dejará de funcionar; si no lo pones en ninguno, todo funciona como antes pero `/mcp` y `/turn` siguen abiertos (en los logs sale un aviso).
4. **Cambiar las contraseñas de las 4 cuentas de prueba.** Se quitaron del README en `c859513`, pero siguen en el historial público de git (`2bd6498`, y probablemente en versiones antiguas de `DOCUMENTACION-TFM.docx`). Opcionalmente, reescribir el historial.
5. **`npm i @nestjs/swagger` en `API_REST TFM`.** `main.ts` ya publica el contrato OpenAPI en `/api-docs` en cuanto el paquete está instalado (tus docs dicen que es obligatorio). No lo añadí yo al `package.json` porque sin acceso a npm no podía actualizar el `package-lock.json`, y un lock desincronizado rompería `npm ci` en Render.
6. **Llevar los cambios a los 4 repos de despliegue** (`dnd5e-DM_IA`, `dm-engine-dnd`, `ui-web`, `app-mobile_dnd`), que es desde donde despliegan Render y Vercel.

## 3. Seguridad (lo más grave)

| Problema | Impacto | Arreglo |
|---|---|---|
| `/mcp` de la API pública sin autenticación | Cualquiera con la URL de Render podía llamar a `grant_xp`, `grant_item`, `resolve_attack`, `end_combat`… y terminar o manipular cualquier partida | Secreto compartido `INTERNAL_API_KEY` en la cabecera `x-internal-api-key`, comparado en tiempo constante |
| `/turn` de dm-engine sin autenticación y sin validar el cuerpo | Gasto de la key de DeepSeek; se podían inyectar mensajes `system` para manipular al DM | Misma cabecera; `parseTurnRequest` solo acepta roles `user`/`assistant`; límite de cuerpo de 1 MB |
| `"999999999999d6"` en `roll_dice` o en la tirada del jugador | Bucle síncrono de ~10¹² vueltas: una sola petición congelaba toda la API | `RandomDiceRoller` limita a 100 dados, 1000 caras y modificador ±1000 |
| `POST /games/:id/message` reenviaba al DM un historial arbitrario del cliente, sin mirar quién llamaba | Cualquier usuario hablaba con el DM de cualquier partida e inventaba respuestas del DM | Nuevo `StartOpeningSceneUseCase`: solo arranca la escena inicial, lo pide el host o un jugador, y el mensaje lo construye el servidor |
| `/attack` y `/start-combat` abiertos a cualquier usuario logueado | `attackerModifier: 999` sobre todo el grupo → fin de partida ajena | Solo admin (los usa el DM por MCP, ningún cliente por REST) |
| `/player-attack` aceptaba la CA del objetivo desde el cliente | `targetArmorClass: -50` = impacto seguro; también se podía atacar a compañeros | La CA sale del enemigo del combate activo; exige turno reclamado, estar vivo y ser jugador de esa partida |
| La tirada del jugador aceptaba cualquier notación | `1d1+19` → un "20 natural" falso en el chat | Solo 1–10 dados estándar sin modificador |
| `/characters/:id/inventory` añadía objetos gratis | Armadura de placas gratis (CA 18) | Solo admin |
| `cast-spell` no comprobaba la partida del conjurador | Con un personaje de la partida A se dañaba a los enemigos de la B | El conjurador tiene que ser jugador de esa partida |
| El JWT seguía valiendo tras borrar al usuario | Acceso completo hasta 7 días | `JwtStrategy` comprueba que la cuenta existe y toma el rol de la BD |

## 4. Bugs de juego y de dominio

**Turnos simultáneos del DM.** Con `turnClaims` no exclusivo, dos jugadores podían disparar dos turnos a la vez: dm-engine reutilizaba el primero para el segundo, así que la acción del segundo jugador nunca llegaba al LLM y la narración del primero salía dos veces en el chat. Ahora `Game.startDmTurn` rechaza un segundo turno mientras el primero sigue vivo, con un mensaje claro, y el móvil bloquea sus botones mientras `dmTurnInProgress` está activo. El flag caduca si el proceso de la API se reinicia a mitad de turno o pasan 10 minutos (el peor caso real es de unos 9,5), y si falla el guardado final el turno se cierra igualmente.

**Partidas largas que dejaban de funcionar.** Se enviaba el `narrativeLog` entero en cada turno. Al superar ~100 KB, dm-engine respondía 413 para siempre, y el mensaje de error que se guardaba agrandaba todavía más el log. Ahora se envían los últimos 60 mensajes (sin empezar nunca por uno del DM), dm-engine acepta hasta 1 MB y el texto de una acción está limitado a 2000 caracteres.

**HP de la ficha siempre lleno.** El daño solo se aplica a `Game.players[].currentHp`, pero la ficha del móvil y la tool `get_character_sheet` leían `Character.hp`. `GetCharacterUseCase` toma ahora el HP actual de la partida, y `GET /characters/:id` pasa por él (antes el controlador leía el repositorio directamente, saltándose la capa de aplicación).

**Escudo que dejaba la CA en 2.** El escudo del SRD es de categoría "Armor" con `base: 2`, y `equipArmor` sustituía la CA. Ahora `equipShield` suma +2, no se acumula si se equipa dos veces y se conserva al cambiar de armadura (nuevo campo `equippedShieldId`).

**Jugadores fantasma.** Borrar un personaje o un usuario dejaba su entrada en `Game.players`: la ronda de combate no avanzaba nunca y la capitanía podía quedarse en un usuario borrado. Ahora se usa `Game.removePlayer`, que además reasigna la capitanía y avanza la ronda si hace falta.

**Otros:** un jugador a 0 HP ya no puede reclamar turno, ni nadie en una partida finalizada; el daño negativo (`1d4-3`) ya no cura; `toSnapshot` copia `turnClaims`; el mensaje "al menos 2 jugador" pasa a plural; `CreateGameDto` acepta 2–4 jugadores (antes 1–4, lo que el dominio rechazaba después); el mapa de candados por partida ya no crece sin límite; la API usa `MONGODB_URI` (la variable documentada) y mantiene `URL` como alternativa, y escucha en `PORT`.

## 5. dm-engine

- **Argumentos JSON inválidos en una tool** (truncados por `max_tokens`, `null`…). Antes tumbaban el turno con un 500; ahora se devuelven al modelo como error de esa tool.
- **Seguro de arranque.** Ya no se repite si la elección taberna/tablón se resolvió en un turno anterior. Antes, "Pregunto al tabernero de la taberna…" en el turno 3 volvía a aplicar el mapa, recolocaba a todos y sustituía la respuesta del DM por la frase fija.
- **Avisos correctivos.** Los flags de fallo (`start_combat`, tools de mapa) se limpian cuando el modelo se recupera solo, en vez de seguir disparando avisos todo el turno.
- **Respuesta del modelo.** Se comprueba `choices[0]`, se avisa en los logs si la respuesta se cortó por `max_tokens`, y un `DEEPSEEK_MAX_TOKENS` no numérico ya no da `NaN`.

## 6. Clientes

- **Sesión.** Un 401 cierra la sesión en ui-web y en el móvil. Solo lo hace si viene de la sesión actual, para no expulsar a un usuario que acaba de volver a entrar. Además, el logout vacía la caché de React Query.
- **Iniciar partida.** El botón solo se activa con 2 o más jugadores y un capitán válido (antes se activaba con 1 y la API lo rechazaba). El texto de la sala ya no dice que el host es capitán por defecto cuando no juega.
- **Códigos de partida.** Se normalizan a mayúsculas ("k7m2qx" daba "Partida no encontrada").
- **Móvil.**
  - Bloquea las acciones mientras el DM responde, si la partida terminó o si el personaje está inconsciente.
  - Refresca la ficha cada 5 s.
  - No muestra la sala de espera de partidas empezadas o terminadas.
  - Marca el escudo como equipado.
- **ui-web.**
  - Muestra los errores de carga en vez de "Cargando…" infinito.
  - Da un mensaje claro si `VITE_API_URL` está mal configurada.
  - Maneja los fallos de reproducción del TTS.
  - El JWT se decodifica en base64url.
- **Código muerto.** Se eliminaron hooks sin uso, sus tipos, `DiceRollPanel` y `public_old_unused`.

## 7. Limpieza y documentación

- **Archivos eliminados:** los scripts vacíos `verify-*.ts`, `src/index.ts`, `jest.tmp.config.js`, las 4 imágenes `.trash_preview_*` (unos 4,6 MB) y `.DS_Store`.
- **Mappers de persistencia:** `magic-item.mapper.ts` y `rules-reference.mapper.ts` se movieron de `dnd5eapi/` a `persistence/mongoose/mappers/`, que es su capa.
- **`.gitignore`:** ahora ignora `.idea/`, `.DS_Store` y `.env.*` (menos `.env.example`).
- **Documentación actualizada:**
  - `INTERNAL_API_KEY` en ambos `.env.example` y en el README.
  - React 18 (no 19) y puerto 3001 en los README y en AGENTS.md.
  - `mobile-app` ya no figura como pendiente.
  - Límite real del bucle del DM (16) en el README de dm-engine.
  - docs/01 recoge el cambio de diseño de "fin de partida si cae todo el grupo", que antes contradecía la especificación.
  - docs/04 explica la protección de `/mcp`.
  - docs/07 aclara que ui-web es de solo lectura.

## 8. Detectado pero no tocado (para decidir tú)

- **Escrituras concurrentes sobre la ficha del personaje.** `grant_item`, `grant_currency`, `buy_item` y las rutas `/characters/*` guardan el documento entero sin candado; dos escrituras simultáneas pueden pisarse. Poco probable en la práctica.
- **Límites que faltan:** no hay límite de intentos en `/auth/login` (`@nestjs/throttler`) ni de uso del TTS por usuario.
- **Heurísticas de texto de dm-engine que pueden fallar:**
  - "no al tablón, a la taberna" elige el tablón.
  - `\bmuere\b` salta con leyendas narradas.
  - "Si el combate ha terminado…" fuerza `end_combat`.
- **La última llamada al modelo tras agotar las iteraciones** se sigue enviando con tools (convendría `tool_choice: 'none'`).
- **El timeout de 15 s del cliente MCP** no cancela la petición en el servidor, así que una tool lenta puede aplicarse aunque el modelo la dé por fallida.
- **Specs que no detectan un `save()` olvidado.** La mayoría de los specs de casos de uso usan repositorios falsos que guardan el objeto vivo, así que un `save()` olvidado no se detecta. Convendría que guardaran `toSnapshot()` y reconstruyeran con `reconstitute` (como ya hace `send-message.use-case.spec.ts`).
- **Swagger:** las DTOs no llevan `@ApiProperty`. Hasta que se decoren, `/api-docs` listará las rutas pero no los esquemas de los cuerpos.
