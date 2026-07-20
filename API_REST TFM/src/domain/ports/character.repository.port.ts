import { Character } from '../entities/character.entity';

export interface CharacterRepository {
  findById(id: string): Promise<Character | null>;
  save(character: Character): Promise<void>;
}

export const CHARACTER_REPOSITORY = Symbol('CharacterRepository');
