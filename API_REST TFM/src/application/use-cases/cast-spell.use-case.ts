import { Injectable, Inject } from '@nestjs/common';
import { DiceRoller, DICE_ROLLER } from '../../domain/ports/dice-roller.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { SpellRepository, SPELL_REPOSITORY } from '../../domain/ports/spell.repository.port';
import { EnemyRepository, ENEMY_REPOSITORY } from '../../domain/ports/enemy.repository.port';
import { AttributeKey, CharacterClass } from '../../domain/entities/character.entity';
import { Game } from '../../domain/entities/game.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface CastSpellInput {
  gameId: string;
  /**
   * Solo se exige por la ruta REST (el jugador lanza su propio hechizo desde
   * el móvil): ahí sí hay que comprobar que el personaje es suyo. La tool MCP
   * cast_spell la invoca el DM-IA directamente y omite este campo -- igual
   * que end_player_turn o grant_item, no hay "usuario que pide la acción" que
   * comprobar cuando es el DM quien decide.
   */
  requestingUserId?: string;
  casterCharacterId: string;
  spellId: string;
  /** instanceId del enemigo en el combate activo — solo necesario si el hechizo hace daño. */
  targetId?: string;
}

export interface CastSpellResult {
  spellName: string;
  damageDealt: number;
  /** null si el hechizo no pide tirada de salvación (o no hace daño). */
  targetSavedThrow: boolean | null;
}

/** A qué atributo lanza sus hechizos cada clase conjuradora. */
const SPELLCASTING_ABILITY_BY_CLASS: Partial<Record<CharacterClass, AttributeKey>> = {
  mago: 'int',
  clerigo: 'wis',
};

const MAX_SUPPORTED_SPELL_LEVEL = 2;

/**
 * Lanza un hechizo de verdad: consume una ranura real, y si el hechizo hace
 * daño, aplica el daño (con tirada de salvación del objetivo si el hechizo
 * la pide) sobre la partida real — no un texto narrado sin efecto mecánico.
 *
 * Simplificaciones deliberadas del MVP:
 * - Solo hechizos de nivel 1-2 (coincide con el tope de ranuras del sistema).
 * - Los hechizos SIN tirada de salvación se consideran impacto automático
 *   (no modelamos la tirada de ataque de conjuro contra la CA).
 * - No hay puntuación de proficiencia en la CD de salvación (8 + modificador,
 *   sin bonificador de competencia), igual que el resto del combate simplificado.
 */
@Injectable()
export class CastSpellUseCase {
  constructor(
    @Inject(DICE_ROLLER) private readonly diceRoller: DiceRoller,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(SPELL_REPOSITORY) private readonly spells: SpellRepository,
    @Inject(ENEMY_REPOSITORY) private readonly enemyRepository: EnemyRepository,
  ) {}

  async execute(input: CastSpellInput): Promise<CastSpellResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const character = await this.characters.findById(input.casterCharacterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }
    if (input.requestingUserId && character.toSnapshot().ownerId !== input.requestingUserId) {
      throw new DomainError('No puedes lanzar conjuros con un personaje que no es tuyo');
    }
    if (!character.knowsSpell(input.spellId)) {
      throw new DomainError('El personaje no conoce ese hechizo');
    }

    const spell = await this.spells.findById(input.spellId);
    if (!spell) {
      throw new DomainError('Hechizo no encontrado en el catálogo');
    }
    const spellSnapshot = spell.toSnapshot();

    if (spellSnapshot.level < 1 || spellSnapshot.level > MAX_SUPPORTED_SPELL_LEVEL) {
      throw new DomainError(
        `Los hechizos de nivel ${spellSnapshot.level} están fuera del alcance de este MVP (máximo nivel ${MAX_SUPPORTED_SPELL_LEVEL})`,
      );
    }
    const slotLevel = spellSnapshot.level as 1 | 2;
    const casterName = character.toSnapshot().name;

    if (!spellSnapshot.damageType) {
      // Hechizo utilitario (ej. Mage Armor) — sin tirada de daño que pueda
      // fallar por datos, así que consumir la ranura de inmediato es seguro.
      // Se deja rastro en el chat igual que con resolve_attack: antes esto no
      // aparecía en narrativeLog, así que el jugador no veía ninguna
      // confirmación de que el hechizo se había lanzado de verdad.
      character.consumeSpellSlot(slotLevel);
      await this.characters.save(character);
      game.appendNarrativeEntry({ role: 'assistant', content: `✨ **${casterName}** lanza **${spellSnapshot.name}**.` });
      await this.games.save(game);
      return { spellName: spellSnapshot.name, damageDealt: 0, targetSavedThrow: null };
    }

    if (!input.targetId) {
      throw new DomainError('Este hechizo requiere un objetivo');
    }

    const encounterEnemy = game.toSnapshot().activeEncounter?.enemies.find((e) => e.instanceId === input.targetId);
    if (!encounterEnemy) {
      throw new DomainError('Objetivo no encontrado en el combate activo');
    }
    const enemy = await this.enemyRepository.findById(encounterEnemy.enemyRefId);
    if (!enemy) {
      throw new DomainError('El enemigo objetivo no existe en el catálogo');
    }

    const damageDice = spellSnapshot.damageAtSlotLevel?.[String(slotLevel)];
    if (!damageDice) {
      throw new DomainError('El hechizo no tiene daño definido para este nivel de ranura');
    }

    let damage = 0;
    let targetSavedThrow: boolean | null = null;
    let dc: number | null = null;

    // CASO REAL detectado en partida: antes, consumeSpellSlot() se llamaba
    // justo después de validar que el personaje conoce el hechizo, ANTES de
    // tirar el daño. Cuando la notación de dados del catálogo era inválida
    // (ej. "3d4 + 3" con espacios, ver spell-mapper.ts), diceRoller.roll()
    // lanzaba un error DESPUÉS de que la ranura ya se hubiera gastado y
    // guardado -- el mago perdía sus ranuras de nivel 1 sin llegar a lanzar
    // el hechizo ni una sola vez. Ahora la tirada de daño (lo único que puede
    // fallar por datos/formato) ocurre primero, y solo si tiene éxito se
    // consume la ranura.
    if (spellSnapshot.savingThrowAbility) {
      const casterAbility = SPELLCASTING_ABILITY_BY_CLASS[character.toSnapshot().class];
      dc = 8 + (casterAbility ? character.attributeModifier(casterAbility) : 0);
      const saveRoll = this.diceRoller.rollD20() + enemy.attributeModifier(spellSnapshot.savingThrowAbility as AttributeKey);
      targetSavedThrow = saveRoll >= dc;

      damage = this.diceRoller.roll(damageDice);
      if (targetSavedThrow) {
        damage = spellSnapshot.savingThrowSuccess === 'half' ? Math.floor(damage / 2) : 0;
      }
    } else {
      damage = this.diceRoller.roll(damageDice);
    }

    character.consumeSpellSlot(slotLevel);
    await this.characters.save(character);

    game.applyDamageToParticipant(input.targetId, damage);
    game.appendNarrativeEntry({
      role: 'assistant',
      content: this.describeSpellDamage(game, casterName, spellSnapshot.name, input.targetId, dc, targetSavedThrow, damage),
    });
    await this.games.save(game);

    return { spellName: spellSnapshot.name, damageDealt: damage, targetSavedThrow };
  }

  private describeSpellDamage(
      game: Game,
      casterName: string,
      spellName: string,
      targetId: string,
      dc: number | null,
      targetSavedThrow: boolean | null,
      damage: number,
  ): string {
    const snapshot = game.toSnapshot();
    const targetName =
        snapshot.players.find((p) => p.characterId === targetId)?.name ??
        snapshot.activeEncounter?.enemies.find((e) => e.instanceId === targetId)?.name ??
        targetId;

    const header = `✨ **${casterName}** lanza **${spellName}** contra **${targetName}**`;

    if (dc === null) {
      // Sin tirada de salvación: impacto automático (simplificación del MVP).
      return `${header} — Daño: **${damage}**`;
    }

    const saveText = targetSavedThrow ? `salva (CD ${dc})` : `falla la salvación (CD ${dc})`;
    return `${header}, ${saveText} — Daño: **${damage}**`;
  }
}
