import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame, useLaunchGame, useJoinGame } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import type { CharacterClass } from '../types/api';
import './LobbyScreen.css';

export function LobbyScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: game, isLoading, error } = useGame(gameId);
  const launchMutation = useLaunchGame(gameId!);
  const joinMutation = useJoinGame(gameId!);
  const { token } = useAuth();
  const [charName, setCharName] = useState('');
  const [charClass, setCharClass] = useState<CharacterClass>('guerrero');
  const [showJoin, setShowJoin] = useState(false);

  // Antes esto se llamaba directamente en el cuerpo del render ("navigate(...); return null;"),
  // lo que React marca como error ("Cannot update a component while rendering a different
  // component") porque dispara una navegación de react-router en mitad del renderizado —
  // en el mejor caso solo un warning, en el peor deja la navegación a medio hacer y la
  // pantalla en blanco. Debe ir en un efecto, ejecutado después de pintar el render actual.
  useEffect(() => {
    if (gameId && game?.status === 'en_curso') {
      navigate(`/game/${gameId}`, { replace: true });
    }
  }, [gameId, game?.status, navigate]);

  if (!gameId) return null;

  if (isLoading) {
    return (
      <div className="lobby-screen">
        <div className="loading-msg">Cargando sala de espera...</div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="lobby-screen">
        <p className="error-msg">{error?.message ?? 'Partida no encontrada'}</p>
      </div>
    );
  }

  if (game.status === 'en_curso') {
    return null;
  }

  let userId: string | null = null;
  let isHost = false;
  if (token) {
    try { userId = JSON.parse(atob(token.split('.')[1])).userId; } catch { /* ignore */ }
    isHost = userId === game.hostUserId;
  }

  const alreadyJoined = game.players.some((p) => p.userId === userId);

  const handleLaunch = () => {
    launchMutation.mutate(undefined, {
      onSuccess: () => {
        navigate(`/game/${gameId}`);
      },
    });
  };

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!charName) return;
    joinMutation.mutate(
      { characterName: charName, characterClass: charClass },
      {
        onSuccess: () => {
          setShowJoin(false);
          setCharName('');
        },
      },
    );
  };

  return (
    <div className="lobby-screen">
      <div className="lobby-card">
        <h1>{game.name}</h1>
        <p className="lobby-subtitle">
          Sala de espera — {game.players.length}/{game.maxPlayers} jugadores
        </p>

        <div className="player-list">
          {Array.from({ length: game.maxPlayers }).map((_, i) => {
            const player = game.players[i];
            return (
              <div key={i} className="player-item">
                {player ? (
                  <>
                    <span className="player-name">{player.name}</span>
                    <span className="player-class">{player.class}</span>
                  </>
                ) : (
                  <span className="empty-slot">Esperando jugador...</span>
                )}
              </div>
            );
          })}
        </div>

        {userId && !alreadyJoined && !showJoin && (
          <button
            className="join-btn"
            onClick={() => setShowJoin(true)}
          >
            Unirse como jugador
          </button>
        )}

        {showJoin && (
          <form className="join-form" onSubmit={handleJoin}>
            <div className="form-group">
              <label htmlFor="charName">Nombre del personaje</label>
              <input
                id="charName"
                type="text"
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                placeholder="Aragorn..."
              />
            </div>
            <div className="form-group">
              <label>Clase</label>
              <div className="class-select">
                {(['guerrero', 'picaro', 'mago', 'clerigo'] as CharacterClass[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`count-btn ${charClass === c ? 'selected' : ''}`}
                    onClick={() => setCharClass(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="join-submit-btn"
              disabled={!charName || joinMutation.isPending}
            >
              {joinMutation.isPending ? 'Uniendo...' : 'Unirse'}
            </button>
            <button type="button" className="cancel-btn" onClick={() => setShowJoin(false)}>
              Cancelar
            </button>
            {joinMutation.error && <p className="error-msg">{joinMutation.error.message}</p>}
          </form>
        )}

        {isHost && (
          <button
            className="launch-btn"
            onClick={handleLaunch}
            disabled={game.players.length < 1 || launchMutation.isPending}
          >
            {launchMutation.isPending ? 'Iniciando...' : 'Iniciar partida'}
          </button>
        )}

        {launchMutation.error && (
          <p className="error-msg">{launchMutation.error.message}</p>
        )}
      </div>
    </div>
  );
}
