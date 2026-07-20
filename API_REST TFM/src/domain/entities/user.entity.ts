export type UserRole = 'admin' | 'player';

export interface UserProps {
  username: string;
  passwordHash: string;
  role: UserRole;
}

/**
 * Cuenta de usuario (docs/10-autenticacion-y-lobby.md). Sin registro
 * público — las cuentas se crean mediante scripts/seed-users.ts o, si quien
 * lo pide ya es admin, mediante CreateUserUseCase (POST /auth/users). El rol
 * 'admin' solo sirve para poder crear más cuentas; no da ningún privilegio
 * extra sobre partidas o personajes.
 */
export class User {
  private constructor(
    public readonly id: string,
    private readonly props: UserProps,
  ) {}

  static create(props: Omit<UserProps, 'role'> & { role?: UserRole }, id: string = crypto.randomUUID()): User {
    return new User(id, { ...props, role: props.role ?? 'player' });
  }

  get role(): UserRole {
    return this.props.role;
  }

  isAdmin(): boolean {
    return this.props.role === 'admin';
  }

  changePassword(newPasswordHash: string): void {
    this.props.passwordHash = newPasswordHash;
  }

  toSnapshot(): UserProps {
    return { ...this.props };
  }
}
