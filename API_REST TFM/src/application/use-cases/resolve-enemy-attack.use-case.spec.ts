import { DiceRoller } from '../../domain/ports/dice-roller.port';
import { GameRepository } from '../../domain/ports/game.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EnemyRepository, EnemySearchCriteria } from '../../domain/ports/enemy.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { Character } from '../../domain/entities/character.entity';
import { Enemy } from '../../domain/entities/enemy.entity';
import { ResolveEnemyAttackUseCase } from './resolve-enemy-attack.use-case';

class FakeDiceRoller implements DiceRoller {
  private i = 0;
  constructor(private readonly values: number[]) {}
  rollD20(): number { return this.values[this.i++]; }
  roll(): number { return this.values[this.i++]; }
}

class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();
  seed(game: Game): void { this.games.set(game.id, game); }
  async findById(id: string): Promise<Game | null> { return this.games.get(id) ?? null; }
  async findByUserId(): Promise<Game[]> { return []; }
  async save(game: Game): Promise<void> { this.games.set(game.id, game); }
  async deleteById(id: string): Promise<void> { this.games.delete(id); }
}

class FakeCharacterRepository implements CharacterRepository {
  constructor(private readonly characters: Character[]) {}
  async findById(id: string): Promise<Character | null> { return this.characters.find((c) => c.id === id) ?? null; }
  async findByOwnerId(): Promise<Character[]> { return []; }
  async save(): Promise<void> {}
  async deleteById(): Promise<void> {}
  async deleteByGameId(): Promise<void> {}
}

class FakeEnemyRepository implements EnemyRepository {
  constructor(private readonly enemies: Enemy[]) {}
  async findById(id: string): Promise<Enemy | null> { return this.enemies.find((e) => e.id === id) ?? null; }
  async search(_c: EnemySearchCriteria): Promise<Enemy[]> { return this.enemies; }
}

const zombie = Enemy.create({
  name: 'Zombie', description: '', tags: ['no-muerto'], challengeRating: 0.25,
  attributes: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
  hp: 22, ac: 8, resistances: [],
  attacks: [{ name: 'Golpe', toHitBonus: 3, damageDice: '1d6+1', damageType: 'contundente' }],
}, 'zombie');

function tablet(): Character {
  return Character.create({
    ownerId: 'user-2', gameId: 'game-1', name: 'Tablet', class: 'guerrero',
    attributes: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    hp: { current: 20, max: 20 }, ac: 16, unassignedSkillPoints: 0,
  }, 'char-2');
}

/** Partida en combate contra un Zombie; con allPlayersActed, la ronda ya está en la fase de enemigos. */
function gameInCombat(allPlayersActed: boolean): { game: Game; zombieId: string } {
  const game = Game.create({ name: 'prueba2', hostUserId: 'host-1', maxPlayers: 2 });
  game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Movil', class: 'mago', currentHp: 14 });
  game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Tablet', class: 'guerrero', currentHp: 20 });
  game.assignCaptain('host-1', 'user-1');
  game.launch('host-1');
  game.startEncounter({
    enemies: [{
      instanceId: 'z1', enemyRefId: 'zombie', name: 'Zombie', currentHp: 22, ac: 8, conditions: [], position: null,
    }],
  });
  game.claimTurn('char-1');
  game.releaseTurnAfterAction('char-1');
  if (allPlayersActed) {
    game.claimTurn('char-2');
    game.releaseTurnAfterAction('char-2');
  }
  return { game, zombieId: 'z1' };
}

function setup(dice: number[], allPlayersActed = true) {
  const games = new FakeGameRepository();
  const { game, zombieId } = gameInCombat(allPlayersActed);
  games.seed(game);
  const useCase = new ResolveEnemyAttackUseCase(
      new FakeDiceRoller(dice), games, new FakeCharacterRepository([tablet()]), new FakeEnemyRepository([zombie]),
  );
  return { games, game, useCase, zombieId };
}

describe('ResolveEnemyAttackUseCase', () => {
  it('el enemigo ataca con su ataque REAL del catálogo contra la armadura REAL del jugador y deja la tirada en el chat', async () => {
    const { games, game, useCase, zombieId } = setup([14, 5]);

    const result = await useCase.execute({ gameId: game.id, enemyInstanceId: zombieId, targetCharacterId: 'char-2' });

    expect(result).toEqual({
      hit: true, attackRoll: 17, damage: 5, attackName: 'Golpe', targetRemainingHp: 15, targetDefeated: false,
    });
    const saved = (await games.findById(game.id))!.toSnapshot();
    expect(saved.players.find((p) => p.characterId === 'char-2')!.currentHp).toBe(15);
    expect(saved.narrativeLog[saved.narrativeLog.length - 1]).toEqual({
      role: 'assistant',
      content: '🎲 **Zombie** ataca con Golpe a **Tablet** (1d20+3): **17** vs Armadura 16 → ¡IMPACTA! — Daño (1d6+1): **5**',
    });
  });

  it('si falla, no hay daño y el chat lo muestra igualmente', async () => {
    const { games, game, useCase, zombieId } = setup([5]);

    const result = await useCase.execute({ gameId: game.id, enemyInstanceId: zombieId, targetCharacterId: 'char-2' });

    expect(result.hit).toBe(false);
    expect(result.damage).toBe(0);
    const saved = (await games.findById(game.id))!.toSnapshot();
    expect(saved.players.find((p) => p.characterId === 'char-2')!.currentHp).toBe(20);
    expect(saved.narrativeLog[saved.narrativeLog.length - 1].content)
        .toBe('🎲 **Zombie** ataca con Golpe a **Tablet** (1d20+3): **8** vs Armadura 16 → falla');
  });

  it('si deja al jugador a 0 HP, el chat dice que cae inconsciente', async () => {
    const { game, useCase, zombieId } = setup([20, 25]);

    const result = await useCase.execute({ gameId: game.id, enemyInstanceId: zombieId, targetCharacterId: 'char-2' });

    expect(result.targetDefeated).toBe(true);
    const log = game.toSnapshot().narrativeLog;
    expect(log[log.length - 1].content).toContain('— **Tablet** cae inconsciente.');
  });

  it('CASO REAL: rechaza el ataque si aún quedan jugadores por actuar en la ronda (no es la fase de enemigos)', async () => {
    const { game, useCase, zombieId } = setup([14, 5], false);

    await expect(useCase.execute({ gameId: game.id, enemyInstanceId: zombieId, targetCharacterId: 'char-2' }))
        .rejects.toThrow(/fase de enemigos.*Tablet/);
  });

  it('rechaza enemigos inexistentes o ya derrotados, y objetivos que no son jugadores vivos', async () => {
    const { game, useCase, zombieId } = setup([14, 5]);

    await expect(useCase.execute({ gameId: game.id, enemyInstanceId: 'no-existe', targetCharacterId: 'char-2' }))
        .rejects.toThrow(/enemigo/i);
    await expect(useCase.execute({ gameId: game.id, enemyInstanceId: zombieId, targetCharacterId: 'char-99' }))
        .rejects.toThrow(/jugador/i);

    game.applyDamageToParticipant(zombieId, 99);
    await expect(useCase.execute({ gameId: game.id, enemyInstanceId: zombieId, targetCharacterId: 'char-2' }))
        .rejects.toThrow(/derrotado/);
  });
});
