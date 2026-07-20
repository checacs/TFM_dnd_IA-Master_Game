import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame, useLaunchGame, useJoinGame, useAssignCaptain } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import type { CharacterClass } from '../types/api';

export function LobbyScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: game, isLoading, error } = useGame(gameId);
  const launchMutation = useLaunchGame(gameId!);
  const joinMutation = useJoinGame(gameId!);
  const assignCaptainMutation = useAssignCaptain(gameId!);
  const { token } = useAuth();
  const [charName, setCharName] = useState('');
  const [charClass, setCharClass] = useState<CharacterClass>('guerrero');
  const [showJoin, setShowJoin] = useState(false);

  // La navegación SIEMPRE en un efecto, nunca en el cuerpo del render — llamar
  // a navigate() durante el render de este componente mientras React todavía
  // está construyendo el árbol de otro (p.ej. BrowserRouter) dispara "Cannot
  // update a component while rendering a different component" y puede dejar
  // la navegación a medias con la pantalla en blanco.
  useEffect(() => {
    if (gameId && game?.status === 'en_curso') {
      navigate(`/game/${gameId}`, { replace: true });
    }
  }, [gameId, game?.status, navigate]);

  if (!gameId) return null;

  if (isLoading) {
    return (
      <div className="full-bleed-screen">
        <div>
          <img src="/logo_dnd.png" alt="Dungeons & Dragons" className="brand-logo" />
          <div className="loading-msg">Cargando sala de espera...</div>
        </div>
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="full-bleed-screen">
        <div className="full-bleed-card">
          <img src="/logo_dnd.png" alt="Dungeons & Dragons" className="brand-logo" />
          <p className="error-msg">{error?.message ?? 'Partida no encontrada'}</p>
        </div>
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
    <div className="full-bleed-screen">
      <div className="full-bleed-card" style={{ maxWidth: 460 }}>
        <img src="/logo_dnd.png" alt="Dungeons & Dragons" className="brand-logo" />
        <h1>{game.name}</h1>
        <p className="subtitle">
          Sala de espera — {game.players.length}/{game.maxPlayers} jugadores
        </p>

        {isHost && (
          <div className="game-code-box">
            <span className="game-code-label">Código de partida (compártelo con quien juegue en remoto)</span>
            <span className="game-code-value">{gameId}</span>
          </div>
        )}

        <ul className="player-slot-list">
          {Array.from({ length: game.maxPlayers }).map((_, i) => {
            const player = game.players[i];
            return (
              <li key={i} className="player-slot">
                {player ? (
                  <>
                    <span className="player-slot-name">{player.name}</span>
                    <span className="player-slot-class">{player.class}</span>
                  </>
                ) : (
                  <span className="player-slot-empty">Esperando jugador...</span>
                )}
              </li>
            );
          })}
        </ul>

        {isHost && game.players.length > 0 && (
          <div className="field-group" style={{ marginTop: '0.75rem' }}>
            <label>
              Elige el capitán (único que podrá hablar con el DM fuera de combate desde el móvil)
            </label>
            <div className="class-select">
              {game.players.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  className={`class-option ${game.captainUserId === p.userId ? 'selected' : ''}`}
                  disabled={assignCaptainMutation.isPending}
                  onClick={() => assignCaptainMutation.mutate({ targetUserId: p.userId })}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {!game.captainUserId && (
              <p className="info-box">Sin asignar todavía — al iniciar la partida, el host es el capitán por defecto.</p>
            )}
            {assignCaptainMutation.error && <p className="error-msg">{assignCaptainMutation.error.message}</p>}
          </div>
        )}

        {userId && !alreadyJoined && !showJoin && (
          <button className="btn-gold" onClick={() => setShowJoin(true)}>
            Unirse como jugador
          </button>
        )}

        {showJoin && (
          <form onSubmit={handleJoin} style={{ marginTop: '0.75rem' }}>
            <div className="field-group">
              <label htmlFor="charName">Nombre del personaje</label>
              <input
                id="charName"
                type="text"
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                placeholder="Aragorn..."
                autoFocus
              />
            </div>
            <div className="field-group">
              <label>Clase</label>
              <div className="class-select">
                {(['guerrero', 'picaro', 'mago', 'clerigo'] as CharacterClass[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`class-option ${charClass === c ? 'selected' : ''}`}
                    onClick={() => setCharClass(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="btn-gold" disabled={!charName || joinMutation.isPending}>
              {joinMutation.isPending ? 'Uniendo...' : 'Unirse'}
            </button>
            <button type="button" className="btn-ghost" style={{ marginTop: '0.5rem' }} onClick={() => setShowJoin(false)}>
              Cancelar
            </button>
            {joinMutation.error && <p className="error-msg">{joinMutation.error.message}</p>}
          </form>
        )}

        {isHost && (
          <button
            className="btn-gold"
            style={{ marginTop: '0.75rem' }}
            onClick={handleLaunch}
            disabled={game.players.length < 1 || launchMutation.isPending}
          >
            {launchMutation.isPending ? 'Iniciando...' : 'Iniciar partida'}
          </button>
        )}

        {launchMutation.error && <p className="error-msg">{launchMutation.error.message}</p>}
      </div>
    </div>
  );
}
