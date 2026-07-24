import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface GrantXpInput {
  gameId: string;
  characterId: string;
  amount: number;
}

export interface GrantXpResult {
  leveledUp: boolean;
  newLevel: number;
}

/**
 * El DM-IA otorga XP tras un evento narrativo (ej. derrotar un enemigo).
 * Solo marca la subida de nivel y los puntos/slots resultantes — la
 * asignación concreta de puntos de habilidad la sigue haciendo el jugador
 * vía LevelUpUseCase desde la app móvil (docs/04-servidor-mcp.md, sección 1).
 *
 * Se detectó en partida real que la XP se otorgaba en completo silencio: la
 * tool grant_xp solo devolvía {leveledUp, newLevel} al propio DM (nunca al
 * chat), así que el jugador no tenía NINGÚN rastro de haber ganado
 * experiencia salvo que abriera su ficha manualmente -- mismo patrón que
 * start-combat.use-case.ts / end-combat.use-case.ts, que ya dejan un mensaje
 * de sistema garantizado en el narrativeLog en vez de depender de que el
 * DM-IA se acuerde de narrarlo. gameId se añade como argumento explícito
 * (igual que el resto de tools que mutan la partida) en vez de derivarlo del
 * propio Character: así mcp.server.ts puede envolver la llamada en
 * withGameLock(gameId, ...) como todas las demás, evitando una actualización
 * perdida si otra mutación de la MISMA partida ocurre a la vez.
 */
@Injectable()
export class GrantXpUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
  ) {}

  async execute(input: GrantXpInput): Promise<GrantXpResult> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    const levelBefore = character.toSnapshot().level;
    character.gainXp(input.amount);
    const levelAfter = character.toSnapshot().level;

    await this.characters.save(character);

    const game = await this.games.findById(input.gameId);
    if (game) {
      const { name } = character.toSnapshot();
      game.appendNarrativeEntry({
        role: 'assistant',
        content: `✨ **${name}** gana **${input.amount} XP**.`,
      });
      await this.games.save(game);
    }
    // Si la partida no aparece (no debería pasar nunca en producción), no se
    // revienta la concesión de XP ya aplicada al personaje: solo se pierde el
    // aviso en el chat, nunca los puntos de experiencia en sí.

    return { leveledUp: levelAfter > levelBefore, newLevel: levelAfter };
  }
}
