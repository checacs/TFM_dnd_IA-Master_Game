import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface PlaceParticipantInput {
  gameId: string;
  participantId: string;
  row: number;
  col: number;
  /** Nombre exacto de la zona de describe_map en la que se narra este posicionamiento — ver Game.placeParticipant. */
  zoneName?: string;
}

/**
 * El DM-IA coloca a un jugador o enemigo en una celda del tablero (ej. al describir la
 * escena inicial o tras un movimiento narrado). Solo MCP, no REST: quien decide la
 * posición narrativa es el DM-IA, no el jugador. La validación de límites/zonas vive
 * en Game.placeParticipant (dominio) — este caso de uso solo orquesta repositorio.
 */
@Injectable()
export class PlaceParticipantUseCase {
  constructor(@Inject(GAME_REPOSITORY) private readonly games: GameRepository) {}

  async execute(input: PlaceParticipantInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    game.placeParticipant(input.participantId, { row: input.row, col: input.col }, input.zoneName);
    await this.games.save(game);
  }
}
