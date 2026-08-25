import { Character } from '../entities/character.entity';

export interface CharacterRepository {
  findById(id: string): Promise<Character | null>;
  /** Usado por ListUsersUseCase y DeleteUserUseCase (panel de administración de usuarios). */
  findByOwnerId(ownerId: string): Promise<Character[]>;
  save(character: Character): Promise<void>;
  /** Borrado individual de un personaje — DeleteCharacterUseCase y DeleteUserUseCase (cascada). */
  deleteById(id: string): Promise<void>;
  deleteByGameId(gameId: string): Promise<void>;
}

export const CHARACTER_REPOSITORY = Symbol('CharacterRepository');
