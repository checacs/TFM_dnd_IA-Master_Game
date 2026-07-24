import { CharacterRepository } from '../../domain/ports/character.repository.port';
import { Character } from '../../domain/entities/character.entity';
import { GrantCurrencyUseCase } from './grant-currency.use-case';

class FakeCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();
  seed(character: Character): void {
    this.characters.set(character.id, character);
  }
  async findById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }
  async save(character: Character): Promise<void> {
    this.characters.set(character.id, character);
  }
}

function buildCharacter() {
  return Character.create({
    ownerId: 'user-1', gameId: 'game-1', name: 'Elyndra', class: 'mago',
    attributes: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 11 },
    hp: { current: 11, max: 14 }, ac: 12, unassignedSkillPoints: 0,
  }, 'char-1');
}

describe('GrantCurrencyUseCase', () => {
  it(
      'añade dinero real al personaje -- lo llama el DM-IA (tool MCP grant_currency) cuando la ' +
      'narración implica que el grupo encuentra o recibe monedas (ej. "contáis unas 12 monedas de cobre" que ' +
      'antes se quedaban solo en el texto, sin ninguna tool que las concediera de verdad)',
      async () => {
        const characters = new FakeCharacterRepository();
        characters.seed(buildCharacter());
        const useCase = new GrantCurrencyUseCase(characters);

        await useCase.execute({ characterId: 'char-1', amount: { copper: 12 } });

        const saved = await characters.findById('char-1');
        expect(saved?.toSnapshot().currency).toEqual({ gold: 0, silver: 1, copper: 2 });
      },
  );

  it('acumula dinero de varias concesiones sucesivas', async () => {
    const characters = new FakeCharacterRepository();
    characters.seed(buildCharacter());
    const useCase = new GrantCurrencyUseCase(characters);

    await useCase.execute({ characterId: 'char-1', amount: { gold: 2 } });
    await useCase.execute({ characterId: 'char-1', amount: { gold: 3, silver: 5 } });

    const saved = await characters.findById('char-1');
    expect(saved?.toSnapshot().currency).toEqual({ gold: 5, silver: 5, copper: 0 });
  });

  it('lanza DomainError si el personaje no existe', async () => {
    const characters = new FakeCharacterRepository();
    const useCase = new GrantCurrencyUseCase(characters);

    await expect(useCase.execute({ characterId: 'no-existe', amount: { gold: 1 } })).rejects.toThrow();
  });
});
