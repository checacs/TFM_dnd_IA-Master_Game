import { Injectable, Inject } from '@nestjs/common';
import { GameRepository, GAME_REPOSITORY } from '../../domain/ports/game.repository.port';
import { CharacterRepository, CHARACTER_REPOSITORY } from '../../domain/ports/character.repository.port';
import { EquipmentRepository, EQUIPMENT_REPOSITORY } from '../../domain/ports/equipment.repository.port';
import { Character, CharacterClass } from '../../domain/entities/character.entity';
import { DomainError } from '../../domain/errors/domain-error';
import { STARTING_WEAPON_BY_CLASS } from '../starting-equipment';

export interface JoinGameInput {
  gameId: string;
  userId: string;
  characterName: string;
  characterClass: CharacterClass;
}

export interface JoinGameResult {
  characterId: string;
}

/**
 * Un jugador autenticado entra en una partida en estado "configuracion"
 * (docs/10-autenticacion-y-lobby.md) creándose un personaje nuevo de nivel 1,
 * con el arma inicial de su clase ya equipada si el catálogo la tiene
 * (docs, paso de integración mecánica).
 */
@Injectable()
export class JoinGameUseCase {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(CHARACTER_REPOSITORY) private readonly characters: CharacterRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
  ) {}

  async execute(input: JoinGameInput): Promise<JoinGameResult> {
    const game = await this.games.findById(input.gameId);
    if (!game) {
      throw new DomainError('Partida no encontrada');
    }

    const character = Character.createNew({
      ownerId: input.userId,
      gameId: input.gameId,
      name: input.characterName,
      class: input.characterClass,
    });

    await this.grantStartingWeapon(character, input.characterClass);

    // game.addPlayer valida hueco disponible, partida no iniciada y usuario no
    // repetido — si lanza, no se ha persistido nada todavía.
    const snapshot = character.toSnapshot();
    game.addPlayer({
      userId: input.userId,
      characterId: character.id,
      name: snapshot.name,
      class: snapshot.class,
      currentHp: snapshot.hp.current,
    });

    await this.characters.save(character);
    await this.games.save(game);

    return { characterId: character.id };
  }

  /**
   * No lanza si el arma no existe en el catálogo (ej. npm run import:equipment
   * no se ha ejecutado todavía) — el personaje se crea igual, sin equipo, y
   * puede añadirlo/equiparlo más tarde a mano.
   */
  private async grantStartingWeapon(character: Character, characterClass: CharacterClass): Promise<void> {
    const weaponId = STARTING_WEAPON_BY_CLASS[characterClass];
    const weapon = await this.equipment.findById(weaponId);
    if (!weapon) {
      return;
    }
    character.addToInventory({ equipmentId: weapon.id, name: weapon.toSnapshot().name });
    character.equipWeapon(weapon.id);
  }
}
