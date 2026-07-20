# Arquitectura Clean de la API (NestJS)

**Estado:** v1.0 — Paso 3 de la hoja de ruta
**Se apoya en:** `01-especificacion-funcional.md`, `02-modelo-datos-mongodb.md`
**Precede a:** servidor MCP (envuelve estos mismos casos de uso como tools)

---

## 1. Mapeo de capas

| Capa Clean Architecture | Carpeta | Depende de NestJS | Depende de Mongo |
|---|---|---|---|
| Dominio (entidades, value objects, puertos) | `domain/` | No | No |
| Aplicación (casos de uso) | `application/` | Solo `@Injectable()` para poder inyectarse | No |
| Infraestructura (repositorios, RNG real) | `infrastructure/` | Sí | Sí |
| Interfaz (controladores, DTOs, guards) | `interface/http/` | Sí | No (habla con casos de uso, no con Mongo directamente) |

La regla de oro: **las flechas de dependencia solo apuntan hacia el dominio.** `interface/` conoce `application/`, `application/` conoce `domain/`, pero `domain/` no conoce a nadie.

## 2. Estructura de carpetas

```
src/
  domain/
    entities/
      character.entity.ts
      enemy.entity.ts
      game.entity.ts
      encounter.entity.ts
    value-objects/
      attributes.vo.ts
      hit-points.vo.ts
    ports/
      character.repository.port.ts
      enemy.repository.port.ts
      game.repository.port.ts
      dice-roller.port.ts
    errors/
      domain-error.ts

  application/
    use-cases/
      create-game.use-case.ts
      start-combat.use-case.ts
      resolve-attack.use-case.ts
      roll-dice.use-case.ts
      level-up.use-case.ts
      save-game.use-case.ts
      load-game.use-case.ts

  infrastructure/
    persistence/mongoose/
      schemas/
        character.schema.ts
        enemy.schema.ts
        game.schema.ts
      repositories/
        mongoose-character.repository.ts
        mongoose-enemy.repository.ts
        mongoose-game.repository.ts
    dice/
      random-dice-roller.ts

  interface/http/
    games/
      games.controller.ts
      dto/create-game.dto.ts
      dto/attack.dto.ts
    characters/
      characters.controller.ts
      dto/level-up.dto.ts

  modules/
    games.module.ts
    characters.module.ts
    app.module.ts
```

## 3. Puertos clave (dominio)

El puerto más importante del proyecto no es un repositorio: es el **generador de tiradas**. Si el dominio dependiera de `Math.random()` directamente, sería imposible testear el combate de forma determinista.

```ts
// domain/ports/dice-roller.port.ts
export interface DiceRoller {
  rollD20(): number;
  roll(notation: string): number; // ej. "1d6+2"
}
export const DICE_ROLLER = Symbol('DiceRoller');
```

```ts
// domain/ports/game.repository.port.ts
export interface GameRepository {
  findById(id: string): Promise<Game | null>;
  save(game: Game): Promise<void>;
}
export const GAME_REPOSITORY = Symbol('GameRepository');
```

(`CharacterRepository` y `EnemyRepository` siguen el mismo patrón.)

## 4. Entidades de dominio con lógica de negocio real

Nada de modelos anémicos: las reglas viven en la entidad, no dispersas en los casos de uso.

```ts
// domain/entities/character.entity.ts
export class Character {
  constructor(
    public readonly id: string,
    private props: CharacterProps,
  ) {}

  get attributeModifier(attr: AttributeKey): number {
    return Math.floor((this.props.attributes[attr] - 10) / 2);
  }

  assignSkillPoint(attribute: AttributeKey): void {
    if (this.props.unassignedSkillPoints <= 0) {
      throw new DomainError('No hay puntos de habilidad disponibles');
    }
    this.props.attributes[attribute] += 1;
    this.props.unassignedSkillPoints -= 1;
  }

  receiveDamage(amount: number): void {
    this.props.hp.current = Math.max(0, this.props.hp.current - amount);
  }

  isDefeated(): boolean {
    return this.props.hp.current === 0;
  }

  toSnapshot(): CharacterProps {
    return { ...this.props };
  }
}
```

## 5. Caso de uso ejemplo: resolver un ataque

Este caso de uso ilustra por qué el `DiceRoller` como puerto es la pieza que hace posible el TDD real sobre las reglas del juego.

```ts
// application/use-cases/resolve-attack.use-case.ts
@Injectable()
export class ResolveAttackUseCase {
  constructor(
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
    @Inject(GAME_REPOSITORY) private readonly gameRepo: GameRepository,
  ) {}

  async execute(input: ResolveAttackInput): Promise<AttackResult> {
    const game = await this.gameRepo.findById(input.gameId);
    if (!game) throw new DomainError('Partida no encontrada');

    const attackRoll = this.diceRoller.rollD20() + input.attackerModifier;
    const hit = attackRoll >= input.targetArmorClass;
    const damage = hit ? this.diceRoller.roll(input.damageDice) : 0;

    if (hit) game.applyDamageToParticipant(input.targetId, damage);
    await this.gameRepo.save(game);

    return { hit, attackRoll, damage };
  }
}
```

## 6. Test unitario (Jest) con RNG falso — Red-Green-Refactor

```ts
class FakeDiceRoller implements DiceRoller {
  private i = 0;
  constructor(private readonly fixedValues: number[]) {}
  rollD20() { return this.fixedValues[this.i++]; }
  roll() { return this.fixedValues[this.i++]; }
}

describe('ResolveAttackUseCase', () => {
  it('impacta cuando la tirada + modificador iguala o supera la CA', async () => {
    // Red: este test falla hasta implementar execute()
    const diceRoller = new FakeDiceRoller([15]); // 1d20 = 15
    const useCase = new ResolveAttackUseCase(diceRoller, fakeGameRepo);

    const result = await useCase.execute({
      gameId: 'g1', targetId: 'enemy-1',
      attackerModifier: 2, targetArmorClass: 17, damageDice: '1d6+2',
    });

    expect(result.hit).toBe(true); // 15 + 2 = 17 >= 17
  });

  it('falla cuando la tirada + modificador no alcanza la CA', async () => {
    const diceRoller = new FakeDiceRoller([5]);
    const useCase = new ResolveAttackUseCase(diceRoller, fakeGameRepo);
    const result = await useCase.execute({
      gameId: 'g1', targetId: 'enemy-1',
      attackerModifier: 2, targetArmorClass: 17, damageDice: '1d6+2',
    });
    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
  });
});
```

En producción, `RandomDiceRoller` (infraestructura) implementa el mismo puerto con aleatoriedad real — el dominio y la aplicación nunca se enteran de la diferencia.

## 7. Infraestructura: adaptador Mongoose

```ts
// infrastructure/persistence/mongoose/repositories/mongoose-game.repository.ts
@Injectable()
export class MongooseGameRepository implements GameRepository {
  constructor(@InjectModel('Game') private readonly model: Model<GameDocument>) {}

  async findById(id: string): Promise<Game | null> {
    const doc = await this.model.findById(id).lean();
    return doc ? GameMapper.toDomain(doc) : null;
  }

  async save(game: Game): Promise<void> {
    const raw = GameMapper.toPersistence(game);
    await this.model.findByIdAndUpdate(game.id, raw, { upsert: true });
  }
}
```

El `GameMapper` (no detallado aquí) es quien traduce entre el esquema Mongo de `02-modelo-datos-mongodb.md` y la entidad de dominio — así el dominio nunca ve un `ObjectId` de Mongo directamente.

## 8. Interfaz HTTP: controlador + DTO validado

```ts
// interface/http/games/dto/attack.dto.ts
export class AttackDto {
  @IsMongoId() targetId: string;
  @IsInt() @Min(-5) @Max(10) attackerModifier: number;
  @IsInt() @Min(1) targetArmorClass: number;
  @Matches(/^\d+d\d+(\+\d+)?$/) damageDice: string; // valida formato "1d6+2"
}
```

```ts
// interface/http/games/games.controller.ts
@Controller('games')
export class GamesController {
  constructor(private readonly resolveAttack: ResolveAttackUseCase) {}

  @Post(':gameId/attack')
  async attack(@Param('gameId') gameId: string, @Body() dto: AttackDto) {
    return this.resolveAttack.execute({ gameId, ...dto });
  }
}
```

La validación de `class-validator` es la que impide que llegue al dominio, por ejemplo, un `attackerModifier` absurdo manipulado desde el cliente — la petición se rechaza en la capa de interfaz, antes incluso de instanciar el caso de uso.

## 9. Módulo NestJS (wiring de dependencias)

```ts
// modules/games.module.ts
@Module({
  imports: [MongooseModule.forFeature([{ name: 'Game', schema: GameSchema }])],
  controllers: [GamesController],
  providers: [
    ResolveAttackUseCase,
    StartCombatUseCase,
    { provide: GAME_REPOSITORY, useClass: MongooseGameRepository },
    { provide: DICE_ROLLER, useClass: RandomDiceRoller },
  ],
})
export class GamesModule {}
```

Aquí es donde se ve por qué Nest encaja tan bien con Clean Architecture: **los tokens (`GAME_REPOSITORY`, `DICE_ROLLER`) son los puertos**, y el `provide/useClass` es literalmente la inversión de dependencias declarada en un solo sitio.

## 10. Casos de uso pendientes de este mismo patrón

Siguiendo la misma estructura que `ResolveAttackUseCase`:

- `CreateGameUseCase` — valida `maxPlayers` (1-4) y nombre de partida (HU1)
- `StartCombatUseCase` — arranca el combate con los enemigos indicados en fase "jugadores" (HU3). Ya no calcula iniciativa: el orden entre jugadores se gestiona con el candado de turno (`Game.claimTurn`/`releaseTurnAfterAction`), no con `DiceRoller`.
- `RollDiceUseCase` — tirada manual solicitada por el DM-IA (HU5)
- `LevelUpUseCase` — aplica `assignSkillPoint()` y gestiona slots de conjuro (HU9)
- `SaveGameUseCase` / `LoadGameUseCase` — persistencia completa del estado (HU6, HU7)

## 11. Definición de terminado de este paso

- Cada caso de uso tiene sus tests unitarios con `FakeDiceRoller` (o fake de repositorio) antes de escribir la implementación real (TDD estricto: Red → Green → Refactor).
- Ningún archivo en `domain/` importa nada de `@nestjs/*` ni de `mongoose`.
- Los controladores no contienen lógica de negocio: solo mapean HTTP → caso de uso.

---

*Siguiente paso: servidor MCP — envolver `ResolveAttackUseCase`, `RollDiceUseCase`, `StartCombatUseCase`, etc. como tools que el Motor IA - DM pueda invocar.*
