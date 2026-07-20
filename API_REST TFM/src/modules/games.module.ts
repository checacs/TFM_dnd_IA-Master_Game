import { Module } from '@nestjs/common';
import { GamesController } from '../interface/http/games/games.controller';
import { CreateGameUseCase } from '../application/use-cases/create-game.use-case';
import { JoinGameUseCase } from '../application/use-cases/join-game.use-case';
import { LaunchGameUseCase } from '../application/use-cases/launch-game.use-case';
import { ResolveAttackUseCase } from '../application/use-cases/resolve-attack.use-case';
import { ResolvePlayerAttackUseCase } from '../application/use-cases/resolve-player-attack.use-case';
import { StartCombatUseCase } from '../application/use-cases/start-combat.use-case';
import { SetBattleMapUseCase } from '../application/use-cases/set-battle-map.use-case';
import { DescribeMapUseCase } from '../application/use-cases/describe-map.use-case';
import { GetGameStateUseCase } from '../application/use-cases/get-game-state.use-case';
import { GrantXpUseCase } from '../application/use-cases/grant-xp.use-case';
import { SearchEnemiesUseCase } from '../application/use-cases/search-enemies.use-case';
import { SearchMapsUseCase } from '../application/use-cases/search-maps.use-case';
import { RollDiceUseCase } from '../application/use-cases/roll-dice.use-case';
import { SendMessageUseCase } from '../application/use-cases/send-message.use-case';
import { SearchSpellsUseCase } from '../application/use-cases/search-spells.use-case';
import { SearchRulesReferenceUseCase } from '../application/use-cases/search-rules-reference.use-case';
import { SearchEquipmentUseCase } from '../application/use-cases/search-equipment.use-case';
import { SearchMagicItemsUseCase } from '../application/use-cases/search-magic-items.use-case';
import { CastSpellUseCase } from '../application/use-cases/cast-spell.use-case';
import { ListMyGamesUseCase } from '../application/use-cases/list-my-games.use-case';
import { ApplyConditionUseCase } from '../application/use-cases/apply-condition.use-case';
import { RemoveConditionUseCase } from '../application/use-cases/remove-condition.use-case';
import { PlaceParticipantUseCase } from '../application/use-cases/place-participant.use-case';
import { ClaimTurnUseCase } from '../application/use-cases/claim-turn.use-case';
import { SendPlayerActionUseCase } from '../application/use-cases/send-player-action.use-case';
import { AdvanceRoundUseCase } from '../application/use-cases/advance-round.use-case';
import { AssignCaptainUseCase } from '../application/use-cases/assign-captain.use-case';
import { GetCharacterUseCase } from '../application/use-cases/get-character.use-case';
import { PlayerRollUseCase } from '../application/use-cases/player-roll.use-case';
import { GameMcpTools } from '../interface/mcp/game-mcp-tools';
import { DM_ENGINE_CLIENT } from '../domain/ports/dm-engine.port';
import { HttpDmEngineClient } from '../infrastructure/dm-engine/http-dm-engine.client';
import { GAME_CODE_GENERATOR } from '../domain/ports/game-code-generator.port';
import { RandomGameCodeGenerator } from '../infrastructure/game-code/random-game-code-generator';

const DM_ENGINE_URL = process.env.DM_ENGINE_URL;

if (!DM_ENGINE_URL) {
  throw new Error(
    'Falta la variable de entorno DM_ENGINE_URL (ej. http://localhost:4000). Añádela a tu .env.',
  );
}

@Module({
  controllers: [GamesController],
  providers: [
    CreateGameUseCase,
    JoinGameUseCase,
    LaunchGameUseCase,
    ResolveAttackUseCase,
    ResolvePlayerAttackUseCase,
    StartCombatUseCase,
    SetBattleMapUseCase,
    DescribeMapUseCase,
    GetGameStateUseCase,
    GrantXpUseCase,
    SearchEnemiesUseCase,
    SearchMapsUseCase,
    RollDiceUseCase,
    SendMessageUseCase,
    SearchSpellsUseCase,
    SearchRulesReferenceUseCase,
    SearchEquipmentUseCase,
    SearchMagicItemsUseCase,
    CastSpellUseCase,
    ListMyGamesUseCase,
    ApplyConditionUseCase,
    RemoveConditionUseCase,
    PlaceParticipantUseCase,
    ClaimTurnUseCase,
    SendPlayerActionUseCase,
    AdvanceRoundUseCase,
    AssignCaptainUseCase,
    GetCharacterUseCase,
    PlayerRollUseCase,
    GameMcpTools,
    { provide: DM_ENGINE_CLIENT, useFactory: () => new HttpDmEngineClient(DM_ENGINE_URL as string) },
    { provide: GAME_CODE_GENERATOR, useClass: RandomGameCodeGenerator },
  ],
  // GameMcpTools se exporta para que main.ts pueda recuperarlo con app.get()
  // y registrar las tools MCP sobre la misma instancia (mismos repositorios).
  exports: [GameMcpTools],
})
export class GamesModule {}
