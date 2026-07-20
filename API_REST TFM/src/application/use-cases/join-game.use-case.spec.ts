import { GameRepository } from '../../domain/ports/game.repository.port';
import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { Character } from '../../domain/entities/character.entity';
import { Equipment } from '../../domain/entities/equipment.entity';
import { JoinGameUseCase } from './join-game.use-case';

class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();
  seed(game: Game): void {
    this.games.set(game.id, game);
  }
  async findById(id: string): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }
  async findByUserId(_userId: string): Promise<Game[]> { return []; }

  async save(game: Game): Promise<void> {
    this.games.set(game.id, game);
  }
}

class FakeCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();
  async findById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }
  async save(character: Character): Promise<void> {
    this.characters.set(character.id, character);
  }
}

class FakeEquipmentRepository implements EquipmentRepository {
  constructor(private readonly items: Equipment[] = []) {}
  async findById(id: string): Promise<Equipment | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  async search(_c: EquipmentSearchCriteria): Promise<Equipment[]> {
    return this.items;
  }
}

function buildDagger() {
  return Equipment.create(
    {
      name: 'Dagger', category: 'Weapon', cost: null, weight: 1, description: '',
      weaponCategory: 'Simple', weaponRange: 'Melee', damageDice: '1d4', damageType: 'piercing',
      properties: ['finesse'],
    },
    'dagger',
  );
}

describe('JoinGameUseCase', () => {
  it('crea un personaje nuevo y lo añade a la partida', async () => {
    const games = new FakeGameRepository();
    const characters = new FakeCharacterRepository();
    const equipment = new FakeEquipmentRepository([buildDagger()]);
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    const useCase = new JoinGameUseCase(games, characters, equipment);
    const result = await useCase.execute({
      gameId: game.id,
      userId: 'user-1',
      characterName: 'Elyndra',
      characterClass: 'mago',
    });

    const savedGame = await games.findById(game.id);
    expect(savedGame?.toSnapshot().players).toHaveLength(1);
    expect(savedGame?.toSnapshot().players[0].userId).toBe('user-1');

    const savedCharacter = await characters.findById(result.characterId);
    expect(savedCharacter?.toSnapshot().ownerId).toBe('user-1');
    expect(savedCharacter?.toSnapshot().class).toBe('mago');
  });

  it('asigna y equipa el arma inicial de la clase, si existe en el catálogo', async () => {
    const games = new FakeGameRepository();
    const characters = new FakeCharacterRepository();
    const equipment = new FakeEquipmentRepository([buildDagger()]); // mago -> dagger
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    const useCase = new JoinGameUseCase(games, characters, equipment);
    const result = await useCase.execute({
      gameId: game.id, userId: 'user-1', characterName: 'Elyndra', characterClass: 'mago',
    });

    const savedCharacter = await characters.findById(result.characterId);
    expect(savedCharacter?.toSnapshot().inventory).toEqual([{ equipmentId: 'dagger', name: 'Dagger' }]);
    expect(savedCharacter?.toSnapshot().equippedWeaponId).toBe('dagger');
  });

  it('no falla al unirse si el arma inicial de la clase no existe todavía en el catálogo', async () => {
    const games = new FakeGameRepository();
    const characters = new FakeCharacterRepository();
    const equipment = new FakeEquipmentRepository([]); // catálogo vacío — import no ejecutado
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    games.seed(game);

    const useCase = new JoinGameUseCase(games, characters, equipment);
    const result = await useCase.execute({
      gameId: game.id, userId: 'user-1', characterName: 'Elyndra', characterClass: 'mago',
    });

    const savedCharacter = await characters.findById(result.characterId);
    expect(savedCharacter?.toSnapshot().inventory).toEqual([]);
    expect(savedCharacter?.toSnapshot().equippedWeaponId).toBeNull();
  });

  it('lanza DomainError si la partida no existe', async () => {
    const games = new FakeGameRepository();
    const characters = new FakeCharacterRepository();
    const equipment = new FakeEquipmentRepository([]);
    const useCase = new JoinGameUseCase(games, characters, equipment);

    await expect(
      useCase.execute({ gameId: 'no-existe', userId: 'user-1', characterName: 'Elyndra', characterClass: 'mago' }),
    ).rejects.toThrow();
  });

  it('no crea ni persiste el personaje si la partida ya está completa', async () => {
    const games = new FakeGameRepository();
    const characters = new FakeCharacterRepository();
    const equipment = new FakeEquipmentRepository([]);
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 1 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'guerrero', currentHp: 14 });
    games.seed(game);

    const useCase = new JoinGameUseCase(games, characters, equipment);

    await expect(
      useCase.execute({ gameId: game.id, userId: 'user-2', characterName: 'Thane', characterClass: 'guerrero' }),
    ).rejects.toThrow();

    const savedGame = await games.findById(game.id);
    expect(savedGame?.toSnapshot().players).toHaveLength(1); // sin cambios
  });
});
