import { Injectable } from '@nestjs/common';
import { CharacterRepository } from '../../../domain/ports/character.repository.port';
import { Character } from '../../../domain/entities/character.entity';

@Injectable()
export class InMemoryCharacterRepository implements CharacterRepository {
  private readonly characters = new Map<string, Character>();

  async findById(id: string): Promise<Character | null> {
    return this.characters.get(id) ?? null;
  }

  async findByOwnerId(ownerId: string): Promise<Character[]> {
    return Array.from(this.characters.values()).filter((c) => c.toSnapshot().ownerId === ownerId);
  }

  async save(character: Character): Promise<void> {
    this.characters.set(character.id, character);
  }

  async deleteById(id: string): Promise<void> {
    this.characters.delete(id);
  }

  async deleteByGameId(gameId: string): Promise<void> {
    for (const [id, character] of this.characters) {
      if (character.toSnapshot().gameId === gameId) {
        this.characters.delete(id);
      }
    }
  }
}
