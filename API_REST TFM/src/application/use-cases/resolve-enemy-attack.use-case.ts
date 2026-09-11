import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EnemyRepository, ENEMY_REPOSITORY } from '../../domain/ports/enemy.repository.port';
import { DomainError } from '../../domain/errors/domain-error';
import { rollD20WithAdvantage } from '../dice-advantage';
import { formatAttackRollMessage } from '../attack-roll-message';
import { CAUSES_DISADVANTAGE_ON_OWN_ATTACKS, GRANTS_ADVANTAGE_TO_ATTACKER } from '../condition-effects';

export interface ResolveEnemyAttackInput {
  gameId: string;
  /** instanceId del enemigo en el combate activo (get_game_state.activeEncounter.enemies[]). */
  enemyInstanceId: string;
  /** characterId del jugador al que ataca. */
  targetCharacterId: string;
}

export interface ResolveEnemyAttackResult {
  hit: boolean;
  attackRoll: number;
  damage: number;
  attackName: string;
  targetRemainingHp: number;
  targetDefeated: boolean;
}

/** Armadura por defecto si la ficha del personaje no se encuentra (dato inconsistente, no debería pasar). */
const FALLBACK_ARMOR_CLASS = 10;

/**
 * Ataque de un ENEMIGO contra un jugador, con los datos reales: el ataque
 * principal del catálogo (bono y dado de daño) y la armadura real del
 * personaje. A diferencia de resolve_attack, el DM-IA no pasa ningún número.
 *
 * CASO REAL (partida prueba2): el DM narraba los zarpazos del Zombie sin
 * tirada ("lanza otro zarpazo torpe contra Tablet, chocando contra su
 * guardia"), incluso mientras aún quedaban jugadores por actuar en la ronda.
 * Aquí la tirada del enemigo siempre queda visible en el chat, y solo se
 * permite en la fase de enemigos.
 */
@Injectable()
export class ResolveEnemyAttackUseCase {
  constructor(
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(ENEMY_REPOSITORY) private readonly enemies: EnemyRepository,
  ) {}

  async execute(input: ResolveEnemyAttackInput): Promise<ResolveEnemyAttackResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }
    const snapshot = game.toSnapshot();
    const encounter = snapshot.activeEncounter;
    if (!encounter) {
      throw new DomainError('No hay combate activo');
    }

    const enemy = encounter.enemies.find((e) => e.instanceId === input.enemyInstanceId);
    if (!enemy) {
      throw new DomainError(
          `El enemigo "${input.enemyInstanceId}" no está en el combate activo -- usa el instanceId real de ` +
          'get_game_state.activeEncounter.enemies[].',
      );
    }
    if (enemy.currentHp <= 0) {
      throw new DomainError(`${enemy.name} ya está derrotado y no puede atacar`);
    }

    const target = snapshot.players.find((p) => p.characterId === input.targetCharacterId);
    if (!target || target.currentHp <= 0) {
      throw new DomainError(
          `El objetivo "${input.targetCharacterId}" no es un jugador consciente de esta partida -- usa el ` +
          'characterId real de get_game_state.players[] de un personaje con HP > 0.',
      );
    }

    if (encounter.roundPhase !== 'enemigos') {
      const pending = snapshot.players
          .filter((p) => p.currentHp > 0 && !encounter.actedThisRound.includes(p.characterId))
          .map((p) => p.name);
      throw new DomainError(
          `Los enemigos solo atacan en la fase de enemigos, y aún quedan jugadores por actuar en esta ronda ` +
          `(${pending.join(', ')}). No narres ataques de enemigos todavía: termina tu respuesta preguntando a ` +
          `${pending.join(' y ')} qué hace.`,
      );
    }

    const catalogEnemy = await this.enemies.findById(enemy.enemyRefId);
    if (!catalogEnemy) {
      throw new DomainError(`${enemy.name} no existe en el catálogo de enemigos`);
    }
    const attack = catalogEnemy.primaryAttack();
    const character = await this.characters.findById(input.targetCharacterId);
    const armorClass = character?.toSnapshot().ac ?? FALLBACK_ARMOR_CLASS;

    const hasDisadvantage = game.getConditions(input.enemyInstanceId).some((c) => CAUSES_DISADVANTAGE_ON_OWN_ATTACKS.has(c));
    const hasAdvantage = game.getConditions(input.targetCharacterId).some((c) => GRANTS_ADVANTAGE_TO_ATTACKER.has(c));
    const attackRoll = rollD20WithAdvantage(this.diceRoller, hasAdvantage, hasDisadvantage) + attack.toHitBonus;
    const hit = attackRoll >= armorClass;
    const damage = hit ? Math.max(0, this.diceRoller.roll(attack.damageDice)) : 0;

    if (hit) {
      game.applyDamageToParticipant(input.targetCharacterId, damage);
    }
    const targetRemainingHp =
        game.toSnapshot().players.find((p) => p.characterId === input.targetCharacterId)?.currentHp ?? 0;
    const targetDefeated = targetRemainingHp <= 0;

    const content = formatAttackRollMessage({
      attackerName: enemy.name,
      weaponName: attack.name,
      targetName: target.name,
      modifier: attack.toHitBonus,
      fromPlayerRoll: false,
      attackRoll,
      armorClass,
      hit,
      damageDice: attack.damageDice,
      damage,
      targetDown: hit && targetDefeated ? 'inconsciente' : null,
    });
    game.appendNarrativeEntry({ role: 'assistant', content });
    await this.games.save(game);

    return { hit, attackRoll, damage, attackName: attack.name, targetRemainingHp, targetDefeated };
  }
}
