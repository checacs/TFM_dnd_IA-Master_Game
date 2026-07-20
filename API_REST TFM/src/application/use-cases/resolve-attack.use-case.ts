import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface ResolveAttackInput {
  gameId: string;
  targetId: string;
  attackerModifier: number;
  targetArmorClass: number;
  damageDice: string;
}

export interface AttackResult {
  hit: boolean;
  attackRoll: number;
  damage: number;
}

/**
 * Resuelve un ataque contra una Clase de Armadura objetivo y aplica el daño
 * resultante sobre la partida real. Toda tirada pasa por el puerto DiceRoller
 * — nunca se calcula un resultado "a mano" ni se deja que el llamador
 * (incluido el motor de IA) lo invente.
 */
@Injectable()
export class ResolveAttackUseCase {
  constructor(
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
  ) {}

  async execute(input: ResolveAttackInput): Promise<AttackResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const attackRoll = this.diceRoller.rollD20() + input.attackerModifier;
    const hit = attackRoll >= input.targetArmorClass;
    const damage = hit ? this.diceRoller.roll(input.damageDice) : 0;

    if (hit) {
      game.applyDamageToParticipant(input.targetId, damage);
      await this.games.save(game);
    }

    return { hit, attackRoll, damage };
  }
}
