import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateGame, useMyGames } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import './GameSetupScreen.css';

export function GameSetupScreen() {
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(2);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const mutation = useCreateGame();
  const { data: myGames, isLoading: loadingGames } = useMyGames();

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!name) return;

    mutation.mutate({ name, maxPlayers }, {
      onSuccess: (data) => {
        navigate(`/game/${data.gameId}/lobby`);
      },
    });
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'configuracion': return 'En espera';
      case 'en_curso': return 'En curso';
      case 'pausada': return 'Pausada';
      case 'finalizada': return 'Finalizada';
      default: return status;
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1>D&D IA Master</h1>
        <button className="logout-btn" onClick={() => { logout(); navigate('/login'); }}>
          Cerrar sesion
        </button>
      </div>

      <div className="create-card">
        <h2>Nueva partida</h2>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label htmlFor="gameName">Nombre de la partida</label>
            <input
              id="gameName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="La tumba del dragon..."
            />
          </div>
          <div className="form-group">
            <label>Numero de jugadores</label>
            <div className="player-count">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`count-btn ${maxPlayers === n ? 'selected' : ''}`}
                  onClick={() => setMaxPlayers(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="create-btn"
            disabled={!name || mutation.isPending}
          >
            {mutation.isPending ? 'Creando...' : 'Crear partida'}
          </button>
          {mutation.error && (
            <p className="error-msg">{mutation.error.message}</p>
          )}
        </form>
      </div>

      {myGames && myGames.length > 0 && (
        <div className="games-list-card">
          <h2>Tus partidas</h2>
          {loadingGames && <div className="loading-msg">Cargando...</div>}
          <div className="games-list">
            {myGames.map((game) => (
              <div
                key={game.id}
                className="game-row"
                onClick={() => {
                  if (game.status === 'en_curso') {
                    navigate(`/game/${game.id}`);
                  } else {
                    navigate(`/game/${game.id}/lobby`);
                  }
                }}
              >
                <div className="game-row-info">
                  <span className="game-row-name">{game.name}</span>
                  <span className="game-row-meta">
                    {game.players}/{game.maxPlayers} jugadores · {getStatusLabel(game.status)}
                  </span>
                </div>
                <span className="game-row-arrow">&rarr;</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
