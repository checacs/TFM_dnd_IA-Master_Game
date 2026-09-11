import { GameRepository } from '../../domain/ports/game.repository.port';
import { MapRepository, MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { BattleMap } from '../../domain/entities/battle-map.entity';
import { SetBattleMapUseCase } from './set-battle-map.use-case';

class FakeGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();
  seed(game: Game): void { this.games.set(game.id, game); }
  async findById(id: string): Promise<Game | null> { return this.games.get(id) ?? null; }
  async findByUserId(): Promise<Game[]> { return []; }
  async save(game: Game): Promise<void> { this.games.set(game.id, game); }
  async deleteById(id: string): Promise<void> { this.games.delete(id); }
}

class FakeMapRepository implements MapRepository {
  constructor(private readonly maps: BattleMap[]) {}
  async findById(id: string): Promise<BattleMap | null> { return this.maps.find((m) => m.id === id) ?? null; }
  async search(_criteria: MapSearchCriteria): Promise<BattleMap[]> { return this.maps; }
}

function simpleMap(id: string, extra: Partial<Parameters<typeof BattleMap.create>[0]> = {}): BattleMap {
  return BattleMap.create({
    name: id, description: '', tags: [], rows: 30, cols: 20, imageUrl: `/maps/${id}.png`, ...extra,
  }, id);
}

const catalog = [
  simpleMap('tabernaMercenarios', { connections: [{ mapId: 'sotanoTaberna', via: 'las escaleras de la cocina' }] }),
  simpleMap('sotanoTaberna', {
    connections: [
      { mapId: 'tabernaMercenarios', via: 'la escalera de caracol que sube a la cocina' },
      { mapId: 'cueva-rio', via: 'la trampilla candada del Almacén del Sótano 2' },
      { mapId: 'cueva-rio-alt', via: 'la trampilla candada del Almacén del Sótano 2' },
    ],
    closedExits: true,
  }),
  simpleMap('cueva-rio'),
  simpleMap('cueva-rio-alt'),
  simpleMap('cripta-multisala'),
];

function gameOnMap(games: FakeGameRepository, mapId: string | null): Game {
  const game = Game.create({ name: 'prueba3', hostUserId: 'host-1', maxPlayers: 4 });
  if (mapId) {
    game.setBattleMap({ rows: 30, cols: 20, imageUrl: `/maps/${mapId}.png`, mapId });
  }
  games.seed(game);
  return game;
}

describe('SetBattleMapUseCase', () => {
  it('aplica el mapa y lo registra en mapHistory', async () => {
    const games = new FakeGameRepository();
    const game = gameOnMap(games, null);
    await new SetBattleMapUseCase(games, new FakeMapRepository(catalog)).execute({ gameId: game.id, mapId: 'tabernaMercenarios' });

    const snapshot = (await games.findById(game.id))!.toSnapshot();
    expect(snapshot.board.imageUrl).toBe('/maps/tabernaMercenarios.png');
    expect(snapshot.mapHistory).toEqual(['tabernaMercenarios']);
  });

  it('CASO REAL: desde el sótano (salidas cerradas) rechaza la cripta, que no está conectada', async () => {
    const games = new FakeGameRepository();
    const game = gameOnMap(games, 'sotanoTaberna');
    const useCase = new SetBattleMapUseCase(games, new FakeMapRepository(catalog));

    await expect(useCase.execute({ gameId: game.id, mapId: 'cripta-multisala' }))
        .rejects.toThrow(/no está conectado/);
    expect((await games.findById(game.id))!.toSnapshot().mapHistory).toEqual(['sotanoTaberna']);
  });

  it('desde el sótano sí deja bajar a cualquiera de las dos cuevas, o volver a la taberna', async () => {
    for (const target of ['cueva-rio', 'cueva-rio-alt', 'tabernaMercenarios']) {
      const games = new FakeGameRepository();
      const game = gameOnMap(games, 'sotanoTaberna');
      await new SetBattleMapUseCase(games, new FakeMapRepository(catalog)).execute({ gameId: game.id, mapId: target });
      expect((await games.findById(game.id))!.toSnapshot().mapHistory).toEqual(['sotanoTaberna', target]);
    }
  });

  it('un mapa sin salidas cerradas (la taberna, con puerta a la calle) no restringe el siguiente', async () => {
    const games = new FakeGameRepository();
    const game = gameOnMap(games, 'tabernaMercenarios');
    await new SetBattleMapUseCase(games, new FakeMapRepository(catalog)).execute({ gameId: game.id, mapId: 'cripta-multisala' });
    expect((await games.findById(game.id))!.toSnapshot().mapHistory).toEqual(['tabernaMercenarios', 'cripta-multisala']);
  });
});
