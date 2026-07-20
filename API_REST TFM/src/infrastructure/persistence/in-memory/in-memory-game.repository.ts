import { Injectable } from '@nestjs/common';
import { GameRepository } from '../../../domain/ports/game.repository.port';
import { Game } from '../../../domain/entities/game.entity';

/**
 * Implementación en memoria de GameRepository. Es una pieza de producción
 * temporal, no un fake de test — sirve para tener la API arrancando y
 * respondiendo peticiones reales antes de conectar Mongoose
 * (docs/03-arquitectura-clean-api-nestjs.md). Se sustituye por
 * MongooseGameRepository cambiando un único `provide` en el módulo de Nest,
 * sin tocar dominio, aplicación, ni los casos de uso que la consumen.
 */
@Injectable()
export class InMemoryGameRepository implements GameRepository {
  private readonly games = new Map<string, Game>();

  async findById(id: string): Promise<Game | null> {
    return this.games.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<Game[]> {
    const result: Game[] = [];
    for (const game of this.games.values()) {
      const snapshot = game.toSnapshot();
      if (snapshot.hostUserId === userId || snapshot.players.some((p) => p.userId === userId)) {
        result.push(game);
      }
    }
    return result;
  }

  async save(game: Game): Promise<void> {
    this.games.set(game.id, game);
  }
}
