import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EQUIPMENT_REPOSITORY } from '../../domain/ports/equipment.repository.port';
import { Character, AttributeKey } from '../../domain/entities/character.entity';
import { EquipmentProps } from '../../domain/entities/equipment.entity';
import { DomainError } from '../../domain/errors/domain-error';
import { rollD20WithAdvantage } from '../dice-advantage';
import { formatAttackRollMessage } from '../attack-roll-message';
import { CAUSES_DISADVANTAGE_ON_OWN_ATTACKS, GRANTS_ADVANTAGE_TO_ATTACKER } from '../condition-effects';

export interface ResolvePlayerAttackInput {
  gameId: string;
  /**
   * Usuario que pide el ataque por REST (se comprueba que el personaje es
   * suyo). La tool MCP resolve_player_attack la invoca el DM-IA y lo omite,
   * igual que cast_spell.
   */
  requestingUserId?: string;
  attackerCharacterId: string;
  /** instanceId de un enemigo del combate activo -- su CA se lee del propio combate, nunca del cliente. */
  targetId: string;
  /**
   * d20 en bruto que el jugador ya tiró con "Tirar Dados" (ver
   * PlayerRollUseCase). Si se pasa, se usa tal cual en vez de tirar otro.
   */
  playerD20?: number;
}

export interface ResolvePlayerAttackResult {
  hit: boolean;
  attackRoll: number;
  damage: number;
  weaponName: string;
  /** HP real que le queda al enemigo tras el golpe. */
  targetRemainingHp: number;
  /** true si el golpe lo ha dejado a 0 HP. */
  targetDefeated: boolean;
}

/**
 * Resuelve el ataque de un jugador usando su arma equipada de verdad (docs,
 * paso de integración mecánica) — a diferencia de ResolveAttackUseCase
 * (paso 3, pensado para que el DM-IA resuelva turnos de enemigos con
 * parámetros explícitos), aquí el modificador y el daño se derivan del
 * catálogo de equipo y de los atributos del propio personaje.
 *
 * Depuración: antes la CA del objetivo la mandaba el cliente
 * (targetArmorClass, sin límite inferior: con -50 se acertaba siempre), no se
 * comprobaba que el atacante fuera jugador de ESA partida ni que tuviera el
 * turno reclamado, y el objetivo podía ser un compañero de grupo. Ahora el
 * objetivo tiene que ser un enemigo del combate activo y su CA sale de ahí.
 */
@Injectable()
export class ResolvePlayerAttackUseCase {
  constructor(
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipmentRepository: EquipmentRepository,
  ) {}

  async execute(input: ResolvePlayerAttackInput): Promise<ResolvePlayerAttackResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const character = await this.characters.findById(input.attackerCharacterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }
    if (input.requestingUserId !== undefined && character.toSnapshot().ownerId !== input.requestingUserId) {
      throw new DomainError('No puedes atacar con un personaje que no es tuyo');
    }

    const snapshot = game.toSnapshot();
    if (snapshot.status !== 'en_curso') {
      throw new DomainError('La partida no está en curso');
    }
    const attacker = snapshot.players.find((p) => p.characterId === input.attackerCharacterId);
    if (!attacker) {
      throw new DomainError('Ese personaje no es un jugador de esta partida');
    }
    if (attacker.currentHp <= 0) {
      throw new DomainError('Ese personaje está inconsciente y no puede actuar');
    }
    const encounter = snapshot.activeEncounter;
    if (!encounter) {
      throw new DomainError('No hay combate activo');
    }
    if (!encounter.turnClaims.includes(input.attackerCharacterId)) {
      throw new DomainError('No tienes el turno reclamado en este combate');
    }
    const target = encounter.enemies.find((e) => e.instanceId === input.targetId);
    if (!target) {
      throw new DomainError('El objetivo tiene que ser un enemigo del combate activo');
    }

    const equippedWeaponId = character.toSnapshot().equippedWeaponId;
    if (!equippedWeaponId) {
      throw new DomainError('El personaje no tiene ningún arma equipada');
    }

    const weapon = await this.equipmentRepository.findById(equippedWeaponId);
    if (!weapon) {
      throw new DomainError('El arma equipada no existe en el catálogo');
    }
    const weaponSnapshot = weapon.toSnapshot();

    const attribute = this.chooseAttribute(weaponSnapshot, character);
    const attackerModifier = character.attributeModifier(attribute);

    const hasDisadvantage = game
      .getConditions(input.attackerCharacterId)
      .some((c) => CAUSES_DISADVANTAGE_ON_OWN_ATTACKS.has(c));
    const hasAdvantage = game.getConditions(input.targetId).some((c) => GRANTS_ADVANTAGE_TO_ATTACKER.has(c));

    if (input.playerD20 !== undefined &&
        (!Number.isInteger(input.playerD20) || input.playerD20 < 1 || input.playerD20 > 20)) {
      throw new DomainError('playerD20 tiene que ser la tirada de 1d20 del jugador: un entero entre 1 y 20');
    }
    const d20 = input.playerD20 ?? rollD20WithAdvantage(this.diceRoller, hasAdvantage, hasDisadvantage);
    const attackRoll = d20 + attackerModifier;
    const hit = attackRoll >= target.ac;
    const damage = hit && weaponSnapshot.damageDice ? Math.max(0, this.diceRoller.roll(weaponSnapshot.damageDice)) : 0;

    const hpBefore = target.currentHp;
    if (hit) {
      game.applyDamageToParticipant(input.targetId, damage);
    }
    const targetRemainingHp =
        game.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === input.targetId)?.currentHp ?? 0;
    const targetDefeated = targetRemainingHp <= 0;

    // La tirada queda en el chat igual que las de resolve_attack: antes este
    // ataque aplicaba el daño sin dejar rastro visible de la tirada.
    game.appendNarrativeEntry({
      role: 'assistant',
      content: formatAttackRollMessage({
        attackerName: attacker.name,
        weaponName: weaponSnapshot.name,
        targetName: target.name,
        modifier: attackerModifier,
        fromPlayerRoll: input.playerD20 !== undefined,
        attackRoll,
        armorClass: target.ac,
        hit,
        damageDice: weaponSnapshot.damageDice ?? '',
        damage,
        targetDown: hit && hpBefore > 0 && targetDefeated ? 'derrotado' : null,
      }),
    });
    await this.games.save(game);

    return { hit, attackRoll, damage, weaponName: weaponSnapshot.name, targetRemainingHp, targetDefeated };
  }

  /**
   * Reglas simplificadas: a distancia siempre DEX; cuerpo a cuerpo con
   * "finesse" usa el mayor entre STR y DEX; el resto, STR.
   */
  private chooseAttribute(weapon: EquipmentProps, character: Character): AttributeKey {
    if (weapon.weaponRange === 'Ranged') {
      return 'dex';
    }
    if (weapon.properties.includes('finesse')) {
      return character.attributeModifier('dex') > character.attributeModifier('str') ? 'dex' : 'str';
    }
    return 'str';
  }
}
