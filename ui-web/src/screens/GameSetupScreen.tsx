import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyGames, useCreateGame, useDeleteGame } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import type { MyGameSummary } from '../types/api';

function gameHref(game: MyGameSummary): string {
  return game.status === 'configuracion' ? `/game/${game.id}/lobby` : `/game/${game.id}`;
}

export function GameSetupScreen() {
  const { data: games, isLoading } = useMyGames();
  const createGame = useCreateGame();
  const deleteGame = useDeleteGame();
  const auth = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [joinCode, setJoinCode] = useState('');

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;
    createGame.mutate(
      { name, maxPlayers },
      {
        onSuccess: (data) => {
          navigate(`/game/${data.gameId}/lobby`);
        },
      },
    );
  };

  // "Unirme con código": GET /games solo devuelve partidas donde el usuario
  // ya es host o jugador (ListMyGamesUseCase), así que un usuario remoto que
  // aún no pertenece a la partida no la ve en la lista de arriba. El host la
  // comparte pegando este gameId por fuera (WhatsApp, etc.) y aquí basta con
  // navegar directo a su lobby — JoinGameUseCase acepta a cualquier
  // autenticado, exista o no ya en players[].
  const handleJoinByCode = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = joinCode.trim();
    if (!trimmed) return;
    navigate(`/game/${trimmed}/lobby`);
  };

  return (
    <div className="full-bleed-screen">
      <div className="full-bleed-card game-setup-card">
        <img src="/logo_dnd.png" alt="Dungeons & Dragons" className="brand-logo" />
        <h1>Tus partidas</h1>
        <p className="subtitle">Elige una partida o crea una nueva aventura</p>

        {/* Dos columnas (a petición del usuario: antes todo iba apilado en
            vertical y, al abrir "Crear nueva partida", la tarjeta crecía más
            que la pantalla y obligaba a hacer scroll). Izquierda: partidas +
            código. Derecha: crear partida, siempre visible (ya no hace falta
            el botón "Crear nueva partida" para desplegar el formulario --
            con columna propia no le quita sitio a la lista de partidas). */}
        <div className="game-setup-columns">
          <div className="game-setup-col">
            {isLoading && <div className="loading-msg">Cargando...</div>}

            {!isLoading && games && games.length === 0 && (
              <p className="subtitle">Aún no tienes ninguna partida.</p>
            )}

            {!isLoading && games && games.length > 0 && (
              <ul className="game-list">
                {games.map((game) => (
                  <li key={game.id} className="game-list-row">
                    <button className="game-list-item" onClick={() => navigate(gameHref(game))}>
                      <span className="game-list-name">{game.name}</span>
                      <span className="game-list-meta">
                        {game.players}/{game.maxPlayers} jugadores · {game.status}
                      </span>
                    </button>
                    {auth.isAdmin && (
                      <button
                        type="button"
                        className="btn-danger-icon"
                        title="Eliminar partida"
                        aria-label={`Eliminar partida ${game.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`¿Eliminar la partida "${game.name}"? Esta acción no se puede deshacer.`)) {
                            deleteGame.mutate(game.id);
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="section-divider">o</div>

            <form onSubmit={handleJoinByCode} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div className="field-group" style={{ flex: 1, minWidth: 0, marginBottom: 0 }}>
                <label htmlFor="joinCode">¿Tienes un código de partida?</label>
                <input
                  id="joinCode"
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Pega el código aquí"
                />
              </div>
              {/* .btn-gold es width:100% por defecto (pensado para botones a ancho
                  completo como "Crear nueva partida") — aquí hay que forzarlo a
                  su contenido para que no se coma toda la fila y deje sitio al
                  input de al lado. */}
              <button
                type="submit"
                className="btn-gold"
                style={{ width: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}
                disabled={!joinCode.trim()}
              >
                Ir
              </button>
            </form>
          </div>

          <div className="game-setup-col game-setup-col-divider">
            <h2 className="game-setup-col-title">Crear nueva partida</h2>
            <form onSubmit={handleCreate}>
              <div className="field-group">
                <label htmlFor="gameName">Nombre de la partida</label>
                <input
                  id="gameName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="La torre olvidada"
                />
              </div>
              <div className="field-group">
                <label htmlFor="maxPlayers">Máximo de jugadores</label>
                <select
                  id="maxPlayers"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-gold" disabled={!name || createGame.isPending}>
                {createGame.isPending ? 'Creando...' : 'Crear partida'}
              </button>
              {createGame.error && <p className="error-msg">{createGame.error.message}</p>}
            </form>
          </div>
        </div>

        <button className="btn-ghost" style={{ marginTop: '1.5rem' }} onClick={auth.logout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
