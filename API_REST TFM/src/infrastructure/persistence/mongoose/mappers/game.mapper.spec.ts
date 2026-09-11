import { Game } from '../../../../domain/entities/game.entity';
import { GameMapper } from './game.mapper';

describe('GameMapper', () => {
  it('convierte de dominio a persistencia y de vuelta sin perder datos, incluyendo combate activo', () => {
    const game = Game.create({ name: 'La torre olvidada', hostUserId: 'host-1', maxPlayers: 4 });
    game.addPlayer({ userId: 'user-1', characterId: 'char-1', name: 'Elyndra', class: 'mago', currentHp: 14 });
    game.addPlayer({ userId: 'user-2', characterId: 'char-2', name: 'Thane', class: 'guerrero', currentHp: 16 });
    game.assignCaptain('host-1', 'user-1'); // launch() exige un capitán válido asignado
    game.launch('host-1');
    game.startEncounter({
      enemies: [{ instanceId: 'enc-1-goblin-a', enemyRefId: 'enemy-1', name: 'Goblin explorador', currentHp: 7, ac: 15 }],
    });
    game.claimTurn('char-1');
    game.setCombatPoint({ row: 3, col: 5 });

    const persisted = GameMapper.toPersistence(game);
    const recovered = GameMapper.toDomain(persisted);

    expect(recovered.id).toBe(game.id);
    expect(recovered.toSnapshot()).toEqual(game.toSnapshot());
  });

  it('convierte una partida recién creada, sin combate activo', () => {
    const game = Game.create({ name: 'Otra partida', hostUserId: 'host-2', maxPlayers: 2 });

    const persisted = GameMapper.toPersistence(game);
    const recovered = GameMapper.toDomain(persisted);

    expect(recovered.toSnapshot().activeEncounter).toBeNull();
    expect(recovered.toSnapshot()).toEqual(game.toSnapshot());
  });
});
