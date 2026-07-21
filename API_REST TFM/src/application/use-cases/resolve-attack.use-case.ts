import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
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
    }

    // Se comprobó que el jugador veía en la narración del DM el resultado de
    // un ataque (impacta/falla, cuánto daño) sin ningún respaldo mecánico
    // visible en el chat -- a diferencia del botón "Tirar Dados" del jugador
    // (PlayerRollUseCase), que sí deja constancia de su tirada. Aquí se hace
    // lo mismo con la tirada que resuelve el sistema, para que el jugador
    // pueda comprobar de dónde sale el "1d8+3" que el DM menciona en su
    // narración, tanto si impacta como si falla.
    game.appendNarrativeEntry({
      role: 'assistant',
      content: this.describeRoll(game, input, attackRoll, hit, damage),
    });
    await this.games.save(game);

    return { hit, attackRoll, damage };
  }

  private describeRoll(
      game: Game,
      input: ResolveAttackInput,
      attackRoll: number,
      hit: boolean,
      damage: number,
  ): string {
    const snapshot = game.toSnapshot();
    const targetName =
        snapshot.players.find((p) => p.characterId === input.targetId)?.name ??
        snapshot.activeEncounter?.enemies.find((e) => e.instanceId === input.targetId)?.name ??
        input.targetId;

    const modifierText = input.attackerModifier >= 0 ? `+${input.attackerModifier}` : `${input.attackerModifier}`;
    const header =
        `🎲 Ataque contra **${targetName}** (1d20${modifierText}): **${attackRoll}** vs CA ${input.targetArmorClass} → ` +
        (hit ? '¡IMPACTA!' : 'falla');

    if (!hit) {
      return header;
    }

    return `${header} — Daño (${input.damageDice}): **${damage}**`;
  }
}
