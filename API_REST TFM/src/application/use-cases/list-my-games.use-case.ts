import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { GameProps } from '../../domain/entities/game.entity';

export interface ListMyGamesInput {
  userId: string;
}

@Injectable()
export class ListMyGamesUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: ListMyGamesInput): Promise<{ id: string; name: string; status: string; players: number; maxPlayers: number }[]> {
    const allGames = await this.games.findByUserId(input.userId);
    return allGames.map((game) => {
      const s = game.toSnapshot();
      return {
        id: game.id,
        name: s.name,
        status: s.status,
        players: s.players.length,
        maxPlayers: s.maxPlayers,
      };
    });
  }
}
