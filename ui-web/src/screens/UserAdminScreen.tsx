import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUsers, useCreateUser, useDeleteUser, useDeleteCharacterAdmin } from '../api/hooks';
import type { UserRole } from '../types/api';

/**
 * Panel "Administración de Usuarios" — solo accesible a un admin (ver
 * AdminRoute en App.tsx). Permite crear y eliminar cuentas, y ver/eliminar
 * los personajes de cada una. Reutiliza ListUsersUseCase/CreateUserUseCase/
 * DeleteUserUseCase/DeleteCharacterUseCase del backend (docs/10, sección 6bis).
 */
export function UserAdminScreen() {
  const navigate = useNavigate();
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const deleteCharacter = useDeleteCharacterAdmin();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('player');

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    createUser.mutate(
      { username, password, role },
      {
        onSuccess: () => {
          setUsername('');
          setPassword('');
          setRole('player');
        },
      },
    );
  };

  const handleDeleteUser = (userId: string, label: string) => {
    if (window.confirm(`¿Eliminar la cuenta "${label}" y todos sus personajes? Esta acción no se puede deshacer.`)) {
      deleteUser.mutate(userId);
    }
  };

  const handleDeleteCharacter = (characterId: string, label: string) => {
    if (window.confirm(`¿Eliminar el personaje "${label}"? Esta acción no se puede deshacer.`)) {
      deleteCharacter.mutate(characterId);
    }
  };

  return (
    <div className="full-bleed-screen">
      <div className="full-bleed-card admin-card">
        <img src="/logo_dnd.png" alt="Dungeons & Dragons" className="brand-logo" />
        <h1>Administración de Usuarios</h1>
        <p className="subtitle">Crea, elimina cuentas y gestiona los personajes de cada jugador</p>

        <div className="admin-columns">
          <div className="admin-col">
            <h2 className="game-setup-col-title">Usuarios y personajes</h2>

            {isLoading && <div className="loading-msg">Cargando...</div>}
            {error && <p className="error-msg">{error.message}</p>}

            {!isLoading && users && users.length === 0 && (
              <p className="subtitle">Todavía no hay ninguna cuenta.</p>
            )}

            {!isLoading && users && users.length > 0 && (
              <ul className="admin-user-list">
                {users.map((user) => (
                  <li key={user.userId} className="admin-user-item">
                    <div className="admin-user-header">
                      <div>
                        <span className="admin-user-name">{user.username}</span>
                        <span className={`admin-role-badge admin-role-${user.role}`}>{user.role}</span>
                      </div>
                      <button
                        type="button"
                        className="btn-danger-icon"
                        title="Eliminar usuario"
                        aria-label={`Eliminar usuario ${user.username}`}
                        disabled={deleteUser.isPending}
                        onClick={() => handleDeleteUser(user.userId, user.username)}
                      >
                        Eliminar
                      </button>
                    </div>

                    {user.characters.length === 0 ? (
                      <p className="admin-no-characters">Sin personajes</p>
                    ) : (
                      <ul className="admin-character-list">
                        {user.characters.map((character) => (
                          <li key={character.id} className="admin-character-item">
                            <span className="admin-character-name">{character.name}</span>
                            <span className="admin-character-meta">
                              {character.class} · nivel {character.level}
                            </span>
                            <button
                              type="button"
                              className="btn-danger-icon"
                              title="Eliminar personaje"
                              aria-label={`Eliminar personaje ${character.name}`}
                              disabled={deleteCharacter.isPending}
                              onClick={() => handleDeleteCharacter(character.id, character.name)}
                            >
                              Eliminar
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {deleteUser.error && <p className="error-msg">{deleteUser.error.message}</p>}
            {deleteCharacter.error && <p className="error-msg">{deleteCharacter.error.message}</p>}
          </div>

          <div className="admin-col admin-col-divider">
            <h2 className="game-setup-col-title">Crear nuevo usuario</h2>
            <form onSubmit={handleCreate}>
              <div className="field-group">
                <label htmlFor="newUsername">Usuario</label>
                <input
                  id="newUsername"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="nombre de usuario"
                />
              </div>
              <div className="field-group">
                <label htmlFor="newPassword">Contraseña</label>
                <input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="mínimo 6 caracteres"
                />
              </div>
              <div className="field-group">
                <label htmlFor="newRole">Rol</label>
                <select id="newRole" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                  <option value="player">player</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <button type="submit" className="btn-gold" disabled={!username || !password || createUser.isPending}>
                {createUser.isPending ? 'Creando...' : 'Crear usuario'}
              </button>
              {createUser.error && <p className="error-msg">{createUser.error.message}</p>}
            </form>
          </div>
        </div>

        <button className="btn-ghost" style={{ marginTop: '1.5rem' }} onClick={() => navigate('/')}>
          Volver
        </button>
      </div>
    </div>
  );
}
