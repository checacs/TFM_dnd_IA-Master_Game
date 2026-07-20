import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { DomainError } from '../../domain/errors/domain-error';

export interface GrantXpInput {
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
 */
@Injectable()
export class GrantXpUseCase {
  constructor(@Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository) {}

  async execute(input: GrantXpInput): Promise<GrantXpResult> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    const levelBefore = character.toSnapshot().level;
    character.gainXp(input.amount);
    const levelAfter = character.toSnapshot().level;

    await this.characters.save(character);

    return { leveledUp: levelAfter > levelBefore, newLevel: levelAfter };
  }
}
