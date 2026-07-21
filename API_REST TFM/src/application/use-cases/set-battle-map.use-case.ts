import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { MapRepository, MAP_REPOSITORY } from '../../domain/ports/map.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface SetBattleMapInput {
  gameId: string;
  mapId: string;
}

@Injectable()
export class SetBattleMapUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(MAP_REPOSITORY) private readonly mapRepository: MapRepository,
  ) {}

  async execute(input: SetBattleMapInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const map = await this.mapRepository.findById(input.mapId);
    if (!map) {
      throw new DomainError(`Mapa ${input.mapId} no encontrado en el catalogo`);
    }

    const snapshot = map.toSnapshot();
    game.setBattleMap({
      rows: snapshot.rows,
      cols: snapshot.cols,
      imageUrl: snapshot.imageUrl,
      zones: snapshot.zones,
      mapId: input.mapId,
    });
    await this.games.save(game);
  }
}
