import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { CharacterProps } from '../../domain/entities/character.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface GetCharacterInput {
  characterId: string;
}

/**
 * Ficha de un personaje, de solo lectura. La usan el DM-IA (tool MCP
 * get_character_sheet) y el móvil (GET /characters/:id): nunca se infiere del
 * historial de chat, siempre se lee de aquí.
 *
 * HP actual: durante una partida el daño se aplica en Game.players[].currentHp
 * (el agregado Game es la fuente de verdad del combate), no en el documento
 * del personaje. Antes esta ficha devolvía Character.hp tal cual, así que el
 * móvil y el DM veían siempre la vida completa aunque el personaje estuviera a
 * 0 HP. Ahora el HP actual se toma de la partida en la que juega.
 */
@Injectable()
export class GetCharacterUseCase {
  constructor(
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
  ) {}

  async execute(input: GetCharacterInput): Promise<CharacterProps> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }
    const snapshot = character.toSnapshot();

    const game = await this.games.findById(snapshot.gameId);
    const player = game?.toSnapshot().players.find((p) => p.characterId === character.id);
    if (player) {
      snapshot.hp = { ...snapshot.hp, current: Math.min(player.currentHp, snapshot.hp.max) };
    }
    return snapshot;
  }
}
