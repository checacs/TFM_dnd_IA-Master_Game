import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EQUIPMENT_REPOSITORY } from '../../domain/ports/equipment.repository.port';
import { Character, AttributeKey } from '../../domain/entities/character.entity';
import { EquipmentProps } from '../../domain/entities/equipment.entity';
import { DomainError } from '../../domain/errors/domain-error';
import { rollD20WithAdvantage } from '../dice-advantage';
import { CAUSES_DISADVANTAGE_ON_OWN_ATTACKS, GRANTS_ADVANTAGE_TO_ATTACKER } from '../condition-effects';

export interface ResolvePlayerAttackInput {
  gameId: string;
  requestingUserId: string;
  attackerCharacterId: string;
  targetId: string;
  targetArmorClass: number;
}

export interface ResolvePlayerAttackResult {
  hit: boolean;
  attackRoll: number;
  damage: number;
  weaponName: string;
}

/**
 * Resuelve el ataque de un jugador usando su arma equipada de verdad (docs,
 * paso de integración mecánica) — a diferencia de ResolveAttackUseCase
 * (paso 3, pensado para que el DM-IA resuelva turnos de enemigos con
 * parámetros explícitos), aquí el modificador y el daño se derivan del
 * catálogo de equipo y de los atributos del propio personaje.
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
    if (character.toSnapshot().ownerId !== input.requestingUserId) {
      throw new DomainError('No puedes atacar con un personaje que no es tuyo');
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

    const attackRoll = rollD20WithAdvantage(this.diceRoller, hasAdvantage, hasDisadvantage) + attackerModifier;
    const hit = attackRoll >= input.targetArmorClass;
    const damage = hit && weaponSnapshot.damageDice ? this.diceRoller.roll(weaponSnapshot.damageDice) : 0;

    if (hit) {
      game.applyDamageToParticipant(input.targetId, damage);
      await this.games.save(game);
    }

    return { hit, attackRoll, damage, weaponName: weaponSnapshot.name };
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
