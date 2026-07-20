import { Game } from '../entities/game.entity';

export interface GameRepository {
  findById(id: string): Promise<Game | null>;
  findByUserId(userId: string): Promise<Game[]>;
  save(game: Game): Promise<void>;
}

export const GAME_REPOSITORY = Symbol('GameRepository');
