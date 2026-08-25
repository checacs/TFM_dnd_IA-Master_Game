import { User } from '../entities/user.entity';

export interface UserRepository {
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  /** Usado por ListUsersUseCase (panel de administración de usuarios). */
  findAll(): Promise<User[]>;
  save(user: User): Promise<void>;
  /** Usado por DeleteUserUseCase — borra únicamente la cuenta, no sus personajes. */
  deleteById(id: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
