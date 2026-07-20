import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { CharacterProps } from '../../domain/entities/character.entity';
import { DomainError } from '../../domain/errors/domain-error';

export interface GetCharacterInput {
  characterId: string;
}

/**
 * Consulta de solo lectura pensada para el DM-IA (tool MCP get_character_sheet):
 * antes de esto, el DM no tenía forma de saber la CA, HP máximo, atributos o
 * equipo de un personaje salvo preguntándoselo al jugador en la narración —
 * algo que rompe la inmersión y que además es innecesario, porque el dato ya
 * vive en Mongo. Mismo patrón que GetGameStateUseCase: nunca se infiere del
 * historial de chat, siempre se lee de aquí.
 */
@Injectable()
export class GetCharacterUseCase {
  constructor(@Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository) {}

  async execute(input: GetCharacterInput): Promise<CharacterProps> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }
    return character.toSnapshot();
  }
}
