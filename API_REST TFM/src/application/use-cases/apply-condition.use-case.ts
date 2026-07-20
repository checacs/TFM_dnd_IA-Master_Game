import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import {
  RulesReferenceRepository,
  RULES_REFERENCE_REPOSITORY,
} from '../../domain/ports/rules-reference.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface ApplyConditionInput {
  gameId: string;
  participantId: string;
  conditionIndex: string;
}

/**
 * El DM-IA aplica una condición a un participante (jugador o enemigo) del
 * combate activo — validada contra el catálogo real (RulesReference), nunca
 * un texto libre inventado. Solo MCP, no REST: quien decide esto es el DM-IA.
 */
@Injectable()
export class ApplyConditionUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(RULES_REFERENCE_REPOSITORY) private readonly rulesReference: RulesReferenceRepository,
  ) {}

  async execute(input: ApplyConditionInput): Promise<void> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const condition = await this.rulesReference.findById(`condition:${input.conditionIndex}`);
    if (!condition) {
      throw new DomainError('Esa condición no existe en el catálogo');
    }

    game.applyCondition(input.participantId, input.conditionIndex);
    await this.games.save(game);
  }
}
