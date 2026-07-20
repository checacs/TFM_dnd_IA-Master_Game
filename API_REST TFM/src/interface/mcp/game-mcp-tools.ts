import { Injectable } from '@nestjs/common';
import { RollDiceUseCase } from '../../application/use-cases/roll-dice.use-case';
import { ResolveAttackUseCase, ResolveAttackInput } from '../../application/use-cases/resolve-attack.use-case';
import { StartCombatUseCase, StartCombatInput } from '../../application/use-cases/start-combat.use-case';
import { SetBattleMapUseCase } from '../../application/use-cases/set-battle-map.use-case';
import { ClearBattleMapUseCase } from '../../application/use-cases/clear-battle-map.use-case';
import { DescribeMapUseCase } from '../../application/use-cases/describe-map.use-case';
import { SearchEnemiesUseCase } from '../../application/use-cases/search-enemies.use-case';
import { SearchMapsUseCase } from '../../application/use-cases/search-maps.use-case';
import { SearchSpellsUseCase } from '../../application/use-cases/search-spells.use-case';
import { SearchRulesReferenceUseCase } from '../../application/use-cases/search-rules-reference.use-case';
import { SearchEquipmentUseCase } from '../../application/use-cases/search-equipment.use-case';
import { SearchMagicItemsUseCase } from '../../application/use-cases/search-magic-items.use-case';
import { GetGameStateUseCase } from '../../application/use-cases/get-game-state.use-case';
import { GrantXpUseCase } from '../../application/use-cases/grant-xp.use-case';
import { ApplyConditionUseCase } from '../../application/use-cases/apply-condition.use-case';
import { RemoveConditionUseCase } from '../../application/use-cases/remove-condition.use-case';
import { PlaceParticipantUseCase } from '../../application/use-cases/place-participant.use-case';
import { AdvanceRoundUseCase } from '../../application/use-cases/advance-round.use-case';
import { GetCharacterUseCase } from '../../application/use-cases/get-character.use-case';
import { EnemySearchCriteria } from '../../domain/ports/enemy.repository.port';
import { MapSearchCriteria } from '../../domain/ports/map.repository.port';
import { SpellSearchCriteria } from '../../domain/ports/spell.repository.port';
import { RulesReferenceSearchCriteria } from '../../domain/ports/rules-reference.repository.port';
import { EquipmentSearchCriteria } from '../../domain/ports/equipment.repository.port';
import { MagicItemSearchCriteria } from '../../domain/ports/magic-item.repository.port';

/**
 * Adaptador MCP (docs/04-servidor-mcp.md) — cada método es una línea que
 * invoca el caso de uso correspondiente. Ninguna regla de negocio vive aquí;
 * es exactamente el mismo patrón que GamesController/CharactersController.
 */
@Injectable()
export class GameMcpTools {
  constructor(
    private readonly rollDice: RollDiceUseCase,
    private readonly resolveAttack: ResolveAttackUseCase,
    private readonly startCombat: StartCombatUseCase,
    private readonly setBattleMap: SetBattleMapUseCase,
    private readonly clearBattleMap: ClearBattleMapUseCase,
    private readonly describeMap: DescribeMapUseCase,
    private readonly searchEnemies: SearchEnemiesUseCase,
    private readonly searchMaps: SearchMapsUseCase,
    private readonly searchSpells: SearchSpellsUseCase,
    private readonly searchRulesReference: SearchRulesReferenceUseCase,
    private readonly searchEquipment: SearchEquipmentUseCase,
    private readonly searchMagicItems: SearchMagicItemsUseCase,
    private readonly getGameState: GetGameStateUseCase,
    private readonly grantXp: GrantXpUseCase,
    private readonly applyCondition: ApplyConditionUseCase,
    private readonly removeCondition: RemoveConditionUseCase,
    private readonly placeParticipant: PlaceParticipantUseCase,
    private readonly advanceRound: AdvanceRoundUseCase,
    private readonly getCharacter: GetCharacterUseCase,
  ) {}

  rollDiceTool(notation: string) {
    return this.rollDice.execute({ notation });
  }

  resolveAttackTool(input: ResolveAttackInput) {
    return this.resolveAttack.execute(input);
  }

  startCombatTool(input: StartCombatInput) {
    return this.startCombat.execute(input);
  }

  setBattleMapTool(gameId: string, mapId: string) {
    return this.setBattleMap.execute({ gameId, mapId });
  }

  clearBattleMapTool(gameId: string) {
    return this.clearBattleMap.execute({ gameId });
  }

  describeMapTool(mapId: string) {
    return this.describeMap.execute({ mapId });
  }

  searchEnemiesTool(criteria: EnemySearchCriteria) {
    return this.searchEnemies.execute(criteria);
  }

  searchMapsTool(criteria: MapSearchCriteria) {
    return this.searchMaps.execute(criteria);
  }

  searchSpellsTool(criteria: SpellSearchCriteria) {
    return this.searchSpells.execute(criteria);
  }

  searchRulesReferenceTool(criteria: RulesReferenceSearchCriteria) {
    return this.searchRulesReference.execute(criteria);
  }

  searchEquipmentTool(criteria: EquipmentSearchCriteria) {
    return this.searchEquipment.execute(criteria);
  }

  searchMagicItemsTool(criteria: MagicItemSearchCriteria) {
    return this.searchMagicItems.execute(criteria);
  }

  gameStateTool(gameId: string) {
    return this.getGameState.execute({ gameId });
  }

  grantXpTool(characterId: string, amount: number) {
    return this.grantXp.execute({ characterId, amount });
  }

  applyConditionTool(gameId: string, participantId: string, conditionIndex: string) {
    return this.applyCondition.execute({ gameId, participantId, conditionIndex });
  }

  removeConditionTool(gameId: string, participantId: string, conditionIndex: string) {
    return this.removeCondition.execute({ gameId, participantId, conditionIndex });
  }

  placeParticipantTool(gameId: string, participantId: string, row: number, col: number) {
    return this.placeParticipant.execute({ gameId, participantId, row, col });
  }

  advanceToPlayerRoundTool(gameId: string) {
    return this.advanceRound.execute({ gameId });
  }

  getCharacterSheetTool(characterId: string) {
    return this.getCharacter.execute({ characterId });
  }
}
