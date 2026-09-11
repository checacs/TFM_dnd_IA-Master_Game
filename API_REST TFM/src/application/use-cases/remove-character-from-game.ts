import { GameRepository } from '../../domain/ports/game.repository.port';
import { withGameLock } from '../../domain/services/game-lock';

/**
 * Saca un personaje de la partida a la que pertenece (si sigue existiendo),
 * serializado con el candado de la partida -- compartido por los borrados
 * administrativos DeleteCharacterUseCase y DeleteUserUseCase.
 */
export async function removeCharacterFromItsGame(games: GameRepository, gameId: string, characterId: string): Promise<void> {
  await withGameLock(gameId, async () => {
    const game = await games.findById(gameId);
    if (!game) {
      return;
    }
    game.removePlayer(characterId);
    await games.save(game);
  });
}
