import { Injectable, Inject } from '@nestjs/common';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { DomainError } from '../../domain/errors/domain-error';
import { Money } from '../../domain/value-objects/money';

export interface GrantCurrencyInput {
  characterId: string;
  amount: Partial<Money>;
}

/**
 * El DM-IA concede dinero encontrado o recibido a un personaje (tool MCP
 * grant_currency) -- mismo hueco que ya resolvió GrantItemUseCase para
 * objetos, pero para monedas (oro/plata/cobre). Se detectó en partida real:
 * el DM narró que el grupo encontraba "unas 12 monedas de cobre" en un
 * cofre, pero como no existía ninguna tool para concederlas, el dinero
 * quedaba solo en el texto, sin llegar nunca al personaje real. Sin
 * comprobación de propiedad, igual que GrantItemUseCase: es el DM quien
 * concede el dinero, no el jugador quien lo reclama.
 */
@Injectable()
export class GrantCurrencyUseCase {
  constructor(@Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository) {}

  async execute(input: GrantCurrencyInput): Promise<void> {
    const character = await this.characters.findById(input.characterId);
    if (!character) {
      throw new DomainError('Personaje no encontrado');
    }

    character.receiveCurrency(input.amount);
    await this.characters.save(character);
  }
}
