# Autenticación y sala de espera (lobby)

**Estado:** v1.0 — Paso 10 (extiende `02`, `03`, `07`, `08`)
**Decisiones confirmadas:** cuentas precreadas por un admin (sin registro público); solo el host puede iniciar la partida.

---

## 1. Qué añade esta pieza

Hasta ahora un "personaje" no tenía dueño real, solo un `ownerName` de texto libre (paso 2). Para que el sistema "reconozca el logueo" de cada jugador, necesitamos identidad real: **usuarios con contraseña, sesión con JWT, y personajes que pertenecen a un usuario concreto**, no a una etiqueta de texto.

## 2. Colección `users` (nueva)

```ts
interface User {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  role: 'admin' | 'player';
  createdAt: Date;
}
```

Como no hay registro público, la creación de usuarios es un **script de semilla** (`scripts/seed-users.ts`), no un endpoint expuesto al público — encaja con el alcance de un TFM sin necesidad de montar un panel de administración. Para altas puntuales posteriores existe `POST /auth/users`, solo accesible a un admin ya autenticado (ver sección 6bis).

## 3. Puertos nuevos (siguiendo el mismo patrón que `DiceRoller`)

```ts
// domain/ports/password-hasher.port.ts
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
export const PASSWORD_HASHER = Symbol('PasswordHasher');

// domain/ports/token-issuer.port.ts
export interface TokenIssuer {
  issue(payload: { userId: string }): string;
  verify(token: string): { userId: string } | null;
}
export const TOKEN_ISSUER = Symbol('TokenIssuer');
```

Infraestructura: `BcryptPasswordHasher` y `JwtTokenIssuer` (con `@nestjs/jwt`) implementan estos puertos — el dominio nunca importa `bcrypt` ni `@nestjs/jwt` directamente, mismo principio que con Mongoose.

## 4. Caso de uso: login

```ts
// application/use-cases/login.use-case.ts
@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
  ) {}

  async execute(input: { username: string; password: string }) {
    const user = await this.users.findByUsername(input.username);
    if (!user) throw new DomainError('Credenciales inválidas');
    const valid = await this.hasher.compare(input.password, user.passwordHash);
    if (!valid) throw new DomainError('Credenciales inválidas');
    return { token: this.tokens.issue({ userId: user.id }) };
  }
}
```

`POST /auth/login` es el único endpoint público de este módulo — todo lo demás exige el token.

## 5. Cambios en `games` y `characters` (paso 2)

```ts
// characters — se añade:
ownerId: ObjectId;   // ref a users, quién es el dueño real del personaje

// games — se añade:
hostUserId: ObjectId;          // quién creó la partida y puede iniciarla
players: {
  userId: ObjectId;             // NUEVO — identidad real, no solo un nombre
  characterId: ObjectId;
  name: string;
  currentHp: number;
}[];
```

## 6. Flujo completo

1. **Admin** ejecuta el script de semilla y crea las cuentas.
2. **Host** hace login (web) → `POST /auth/login` → token JWT.
3. **Host** crea la partida (`POST /games`, ya definido en el paso 3) → queda `hostUserId = host.id`, estado `configuracion`.
4. **Cada jugador** hace login (móvil) → ve la lista de partidas en `configuracion` (`GET /games?status=configuracion`) → selecciona una → pulsa "Entrar a partida".
5. **`JoinGameUseCase`** crea su personaje (nombre + clase) ligado a `ownerId = jugador.id` y `gameId`, y lo añade a `players[]` — comprobando hueco disponible y que no esté ya dentro.
6. **Host**, cuando ve suficientes jugadores en la sala de espera, pulsa "Iniciar partida" → `LaunchGameUseCase` comprueba que quien lo pulsa es realmente `hostUserId` (si no, rechaza) y pasa el estado a `en_curso`. Si el host no ha asignado explícitamente un capitán (ver abajo), `Game.launch()` fija por defecto `captainUserId = hostUserId` — el capitán es el único jugador que podrá escribir al DM fuera de combate (`SendPlayerActionUseCase`, ver `08-app-movil.md`).
7. (Opcional, antes o después de lanzar) **Host** reasigna el capitán desde la sala de espera → `POST /games/:id/assign-captain { targetUserId }` (`AssignCaptainUseCase`, rechaza si quien lo pide no es el host o si el `targetUserId` no es un jugador de la partida).

```ts
// application/use-cases/join-game.use-case.ts
export class JoinGameUseCase {
  async execute(input: { gameId: string; userId: string; characterName: string; characterClass: CharacterClass }) {
    const game = await this.games.findById(input.gameId);
    if (!game) throw new DomainError('Partida no encontrada');
    if (game.status !== 'configuracion') throw new DomainError('La partida ya ha empezado');
    if (game.players.length >= game.maxPlayers) throw new DomainError('La partida está completa');
    if (game.players.some((p) => p.userId === input.userId)) throw new DomainError('Ya estás en esta partida');

    const character = Character.create({ ownerId: input.userId, gameId: input.gameId, name: input.characterName, class: input.characterClass });
    await this.characters.save(character);
    game.addPlayer({ userId: input.userId, characterId: character.id, name: character.name, currentHp: character.hp.current });
    await this.games.save(game);
    return { characterId: character.id };
  }
}

// application/use-cases/launch-game.use-case.ts
export class LaunchGameUseCase {
  async execute(input: { gameId: string; requestingUserId: string }) {
    const game = await this.games.findById(input.gameId);
    if (!game) throw new DomainError('Partida no encontrada');
    if (game.hostUserId !== input.requestingUserId) throw new DomainError('Solo el host puede iniciar la partida');
    if (game.players.length < 2) throw new DomainError('Se necesitan al menos 2 jugadores');
    game.launch(); // status -> 'en_curso'
    await this.games.save(game);
  }
}
```

Nota de nomenclatura: llamé a esto `LaunchGameUseCase` y no `StartGameUseCase` a propósito — para no confundirlo con la tool MCP `start_combat` del paso 4, que resuelve un combate dentro de una partida ya iniciada. Son conceptos distintos y conviene que el nombre lo deje claro.

## 6bis. Alta de cuentas tras el arranque: `POST /auth/users`

El script de semilla sigue siendo la forma de crear la primera cuenta (admin). Para altas posteriores (p. ej. dar de alta jugadores de prueba sin tocar Mongo a mano) existe `CreateUserUseCase`, expuesto como `POST /auth/users { username, password, role? }` — sigue sin haber registro público: el endpoint exige `JwtAuthGuard` + `AdminGuard`, y `AdminGuard` comprueba en la propia base de datos (no en el token) que quien llama tiene `role: 'admin'`. `User` ganó un campo `role: 'admin' | 'player'` (por defecto `'player'`); el rol admin no da ningún privilegio sobre partidas o personajes, solo permite crear más cuentas.

```ts
// application/use-cases/create-user.use-case.ts
export class CreateUserUseCase {
  async execute(input: { requestingUserId: string; username: string; password: string; role?: 'admin' | 'player' }) {
    const requester = await this.users.findById(input.requestingUserId);
    if (!requester || !requester.isAdmin()) throw new DomainError('Solo un administrador puede crear usuarios');
    if (await this.users.findByUsername(input.username)) throw new DomainError('Ya existe un usuario con ese nombre');
    const passwordHash = await this.hasher.hash(input.password);
    const user = User.create({ username: input.username, passwordHash, role: input.role ?? 'player' });
    await this.users.save(user);
    return { userId: user.id, username: input.username, role: user.role };
  }
}
```

`scripts/seed-users.ts` marca `carlos` como `admin` y siembra tres cuentas de jugador de prueba (`jugador1`/`jugador2`/`jugador3`) para poder probar partidas con varios usuarios reales sin depender de una única cuenta.

## 7. Un hueco de seguridad que esto cierra retroactivamente

`LevelUpUseCase` (paso 3) no comprobaba de quién era el personaje al asignar puntos de habilidad — con `ownerId` ya disponible, hay que añadir esa comprobación:

```ts
if (character.ownerId !== input.requestingUserId) {
  throw new DomainError('No puedes modificar un personaje que no es tuyo');
}
```

Sin esta pieza, cualquier jugador podría haber llamado al endpoint de subir de nivel de la ficha de otro. Merece la pena volver al paso 3 y añadirlo antes de implementar.

## 8. Guard de NestJS

```ts
// interface/http/auth/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Se aplica con `@UseGuards(JwtAuthGuard)` en los controladores de `games` y `characters`; el `userId` autenticado se lee de `req.user.id`, nunca de un campo que mande el cliente en el body — así no hay forma de que alguien "diga ser" otro usuario.

## 9. Sala de espera en la UI web (mockup arriba)

Extiende el paso 7: tras crear la partida, el host ve esta pantalla en vez de ir directo al juego. Usa el **polling ligero** que comentamos (cada 3-5s, solo en esta pantalla) para reflejar cuántos jugadores se han unido — es una pantalla de corta duración y baja frecuencia de cambio, así que no justifica WebSockets, a diferencia de la narración en juego.

## 10. Definición de terminado de este paso

- Ningún endpoint de `games` o `characters` acepta un `userId` desde el body — siempre viene del token verificado.
- `JoinGameUseCase` rechaza partidas llenas, ya iniciadas, o un segundo intento de unirse del mismo usuario (tests unitarios para los tres casos).
- `LaunchGameUseCase` rechaza a cualquiera que no sea el host (test unitario).
- El fix de ownership en `LevelUpUseCase` tiene su propio test que verifica el rechazo.
- `POST /auth/users` rechaza a cualquiera que no sea admin, y rechaza nombres de usuario repetidos (tests unitarios de `CreateUserUseCase`).

---

*Esto completa la hoja de ruta con la pieza de autenticación. Documentación total en `/docs/01` a `/docs/10`.*
