import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CreateGameUseCase } from '../../../application/use-cases/create-game.use-case';
import { JoinGameUseCase } from '../../../application/use-cases/join-game.use-case';
import { LaunchGameUseCase } from '../../../application/use-cases/launch-game.use-case';
import { ResolveAttackUseCase } from '../../../application/use-cases/resolve-attack.use-case';
import { ResolvePlayerAttackUseCase } from '../../../application/use-cases/resolve-player-attack.use-case';
import { StartCombatUseCase } from '../../../application/use-cases/start-combat.use-case';
import { GetGameStateUseCase } from '../../../application/use-cases/get-game-state.use-case';
import { SendMessageUseCase } from '../../../application/use-cases/send-message.use-case';
import { CastSpellUseCase } from '../../../application/use-cases/cast-spell.use-case';
import { ListMyGamesUseCase } from '../../../application/use-cases/list-my-games.use-case';
import { ClaimTurnUseCase } from '../../../application/use-cases/claim-turn.use-case';
import { SendPlayerActionUseCase } from '../../../application/use-cases/send-player-action.use-case';
import { PlayerRollUseCase } from '../../../application/use-cases/player-roll.use-case';
import { AssignCaptainUseCase } from '../../../application/use-cases/assign-captain.use-case';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { CreateGameDto } from './dto/create-game.dto';
import { JoinGameDto } from './dto/join-game.dto';
import { AttackDto } from './dto/attack.dto';
import { PlayerAttackDto } from './dto/player-attack.dto';
import { StartCombatDto } from './dto/start-combat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { CastSpellDto } from './dto/cast-spell.dto';
import { ClaimTurnDto } from './dto/claim-turn.dto';
import { PlayerActionDto } from './dto/player-action.dto';
import { PlayerRollDto } from './dto/player-roll.dto';
import { AssignCaptainDto } from './dto/assign-captain.dto';
import { withGameLock } from '../../../domain/services/game-lock';

@UseGuards(JwtAuthGuard)
@Controller('games')
export class GamesController {
  constructor(
    private readonly createGame: CreateGameUseCase,
    private readonly joinGame: JoinGameUseCase,
    private readonly launchGame: LaunchGameUseCase,
    private readonly resolveAttack: ResolveAttackUseCase,
    private readonly resolvePlayerAttack: ResolvePlayerAttackUseCase,
    private readonly startCombat: StartCombatUseCase,
    private readonly getGameState: GetGameStateUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly castSpell: CastSpellUseCase,
    private readonly listMyGames: ListMyGamesUseCase,
    private readonly claimTurn: ClaimTurnUseCase,
    private readonly sendPlayerAction: SendPlayerActionUseCase,
    private readonly playerRollUseCase: PlayerRollUseCase,
    private readonly assignCaptain: AssignCaptainUseCase,
  ) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.listMyGames.execute({ userId });
  }

  @Post()
  create(@Body() dto: CreateGameDto, @CurrentUserId() hostUserId: string) {
    return this.createGame.execute({ ...dto, hostUserId });
  }

  @Get(':gameId')
  getState(@Param('gameId') gameId: string) {
    return this.getGameState.execute({ gameId });
  }

  // A partir de aquí, TODOS los endpoints que mutan la partida pasan por
  // withGameLock(gameId, ...) -- ver domain/services/game-lock.ts para la
  // explicación completa del bug real que esto corrige (lost updates entre
  // peticiones concurrentes sobre el mismo documento de Game: turnos
  // reclamados que desaparecían y HP que no se actualizaba).

  @Post(':gameId/join')
  join(@Param('gameId') gameId: string, @Body() dto: JoinGameDto, @CurrentUserId() userId: string) {
    return withGameLock(gameId, () => this.joinGame.execute({ gameId, userId, ...dto }));
  }

  @Post(':gameId/launch')
  launch(@Param('gameId') gameId: string, @CurrentUserId() requestingUserId: string) {
    return withGameLock(gameId, () => this.launchGame.execute({ gameId, requestingUserId }));
  }

  @Post(':gameId/start-combat')
  startCombatAction(@Param('gameId') gameId: string, @Body() dto: StartCombatDto) {
    return withGameLock(gameId, () => this.startCombat.execute({ gameId, enemyIds: dto.enemyIds, mapId: dto.mapId }));
  }

  /** Turno de un enemigo (lo resuelve el DM-IA vía MCP) — parámetros explícitos, ver docs/04. */
  @Post(':gameId/attack')
  attack(@Param('gameId') gameId: string, @Body() dto: AttackDto) {
    return withGameLock(gameId, () => this.resolveAttack.execute({ gameId, ...dto }));
  }

  /** Turno de un jugador — el modificador y el daño se derivan de su arma equipada. */
  @Post(':gameId/player-attack')
  playerAttack(@Param('gameId') gameId: string, @Body() dto: PlayerAttackDto, @CurrentUserId() requestingUserId: string) {
    return withGameLock(gameId, () => this.resolvePlayerAttack.execute({ gameId, requestingUserId, ...dto }));
  }

  @Post(':gameId/message')
  sendPlayerMessage(@Param('gameId') gameId: string, @Body() dto: SendMessageDto) {
    return withGameLock(gameId, () => this.sendMessage.execute({ gameId, messages: dto.messages }));
  }

  @Post(':gameId/cast-spell')
  castSpellAction(@Param('gameId') gameId: string, @Body() dto: CastSpellDto, @CurrentUserId() requestingUserId: string) {
    return withGameLock(gameId, () => this.castSpell.execute({ gameId, requestingUserId, ...dto }));
  }

  /** "Mi turno" desde el móvil — reclama el candado de turno en la ronda de jugadores en curso. */
  @Post(':gameId/claim-turn')
  claimTurnAction(@Param('gameId') gameId: string, @Body() dto: ClaimTurnDto, @CurrentUserId() requestingUserId: string) {
    return withGameLock(gameId, () => this.claimTurn.execute({ gameId, requestingUserId, characterId: dto.characterId }));
  }

  /** Campo de texto del móvil — equivale a "responder al chat del DM" (en combate exige turno reclamado, fuera de combate exige ser el capitán). */
  @Post(':gameId/player-action')
  playerAction(@Param('gameId') gameId: string, @Body() dto: PlayerActionDto, @CurrentUserId() requestingUserId: string) {
    return withGameLock(gameId, () => this.sendPlayerAction.execute({ gameId, requestingUserId, ...dto }));
  }

  /** Botón "Tirar Dados" del móvil — se añade al narrativeLog atribuida al jugador para que se vea en el chat de ui-web (ver PlayerRollUseCase). */
  @Post(':gameId/player-roll')
  playerRoll(@Param('gameId') gameId: string, @Body() dto: PlayerRollDto, @CurrentUserId() requestingUserId: string) {
    return withGameLock(gameId, () => this.playerRollUseCase.execute({
      gameId, requestingUserId, characterId: dto.characterId, notation: dto.notation,
    }));
  }

  /** Reasigna quién es el capitán del grupo — puede llamarlo el host o el capitán actual (Game.assignCaptain). */
  @Post(':gameId/assign-captain')
  assignCaptainAction(@Param('gameId') gameId: string, @Body() dto: AssignCaptainDto, @CurrentUserId() requestingUserId: string) {
    return withGameLock(gameId, () => this.assignCaptain.execute({ gameId, requestingUserId, targetUserId: dto.targetUserId }));
  }
}
