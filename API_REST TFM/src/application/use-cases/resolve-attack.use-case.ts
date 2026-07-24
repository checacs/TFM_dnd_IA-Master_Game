import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { Game } from '../../domain/entities/game.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface ResolveAttackInput {
  gameId: string;
  targetId: string;
  /**
   * Nombre real del atacante (ej. "Matón Cicatrizado", el nombre reflavored
   * del enemigo, no su tipo genérico) -- CASO REAL detectado en partida: el
   * chat mostraba "Ataque contra 1 (1d20+3): 4 vs CA 15 → falla" sin decir
   * quién atacaba ni con qué. Ahora es obligatorio para que el mensaje del
   * chat siempre diga quién ataca.
   */
  attackerName: string;
  /** Nombre del arma/ataque con el que golpea (ej. "su hacha mellada"). Opcional: si se omite, el mensaje no lo menciona. */
  weaponName?: string;
  attackerModifier: number;
  targetArmorClass: number;
  damageDice: string;
  /**
   * El d20 EN BRUTO (sin modificador) que el propio jugador ya tiró con el
   * botón "Tirar Dados" del móvil (ver PlayerRollUseCase), y que ya quedó
   * publicado en el chat. Si se pasa, se usa este valor tal cual en vez de
   * que el sistema tire un d20 nuevo por su cuenta -- se detectó que el
   * jugador perdía la sensación de agencia cuando la IA resolvía su propio
   * ataque con una tirada interna invisible, sin que él llegara a pulsar el
   * botón. Solo aplica al d20 de IMPACTO: el dado de daño lo sigue tirando
   * el sistema siempre (el botón del jugador está fijado a 1d20, no puede
   * tirar "1d6+2"). Los ataques de ENEMIGOS (que el jugador no tira) siguen
   * omitiendo este campo, y el sistema tira su propio d20 como antes.
   */
  playerD20?: number;
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

    // CASO REAL detectado en partida: el chat mostró "Ataque contra 1" y
    // "Ataque contra 2" en vez del nombre real de San/Che -- el DM había
    // pasado un targetId inventado ("1", "2") que no correspondía a ningún
    // characterId/instanceId real. Se rechaza aquí, en vez de degradar
    // mostrando el id crudo: fuerza al DM a reintentar con el id real de
    // get_game_state, en vez de dejar pasar un mensaje ilegible al jugador.
    const snapshotForValidation = game.toSnapshot();
    const targetIsPlayer = snapshotForValidation.players.some((p) => p.characterId === input.targetId);
    const targetIsEnemy =
        snapshotForValidation.activeEncounter?.enemies.some((e) => e.instanceId === input.targetId) ?? false;
    if (!targetIsPlayer && !targetIsEnemy) {
      throw new DomainError(
          `targetId "${input.targetId}" no corresponde a ningún jugador ni enemigo real de esta partida -- ` +
          'usa el characterId real de get_game_state.players[] o el instanceId real de ' +
          'get_game_state.activeEncounter.enemies[], nunca un número o nombre inventado.',
      );
    }

    const d20 = input.playerD20 ?? this.diceRoller.rollD20();
    const attackRoll = d20 + input.attackerModifier;
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
    // Si el d20 vino de playerD20, se aclara que es la tirada del jugador (la
    // que ya vio en pantalla al pulsar "Tirar Dados") y no una tirada nueva e
    // invisible calculada por el sistema -- para que quede claro de dónde
    // sale el número sin tener que ir a mirar el mensaje anterior del chat.
    const rollSource = input.playerD20 !== undefined ? ' (tirada del jugador)' : '';
    // CASO REAL: antes decía "Ataque contra {targetId}" sin decir quién
    // atacaba, y el jugador solo veía un id crudo si el DM se equivocaba de
    // target. Ahora siempre nombra al atacante real y, si se indica, el arma.
    const weaponText = input.weaponName ? ` con ${input.weaponName}` : '';
    const header =
        `🎲 **${input.attackerName}** ataca${weaponText} a **${targetName}** (1d20${modifierText}${rollSource}): ` +
        `**${attackRoll}** vs Armadura ${input.targetArmorClass} → ` + (hit ? '¡IMPACTA!' : 'falla');

    if (!hit) {
      return header;
    }

    return `${header} — Daño (${input.damageDice}): **${damage}**`;
  }
}
