import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame, useLaunchGame, useAssignCaptain } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { decodeJwtPayload } from '../auth/jwt';

/** Igual que MIN_PLAYERS_TO_LAUNCH en Game (backend): antes el botón se habilitaba con 1 jugador y la API lo rechazaba. */
const MIN_PLAYERS_TO_LAUNCH = 2;

export function LobbyScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: game, isLoading, error } = useGame(gameId);
  const launchMutation = useLaunchGame(gameId!);
  const assignCaptainMutation = useAssignCaptain(gameId!);
  const { token } = useAuth();

  // La navegación SIEMPRE en un efecto, nunca en el cuerpo del render — llamar
  // a navigate() durante el render de este componente mientras React todavía
  // está construyendo el árbol de otro (p.ej. BrowserRouter) dispara "Cannot
  // update a component while rendering a different component" y puede dejar
  // la navegación a medias con la pantalla en blanco.
  useEffect(() => {
    // 'finalizada' también: una partida terminada no tiene sala de espera
    // (antes mostraba el botón "Iniciar partida" sobre una partida acabada).
    if (gameId && (game?.status === 'en_curso' || game?.status === 'finalizada')) {
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

  if (game.status === 'en_curso' || game.status === 'finalizada') {
    return null;
  }

  const userId = decodeJwtPayload(token)?.userId ?? null;
  const isHost = userId !== null && userId === game.hostUserId;
  // Mismas reglas que Game.launch en el backend: mínimo de jugadores y un
  // capitán válido (o el host jugando, que lo asume por defecto).
  const hostIsPlayer = game.players.some((p) => p.userId === game.hostUserId);
  const canLaunch = game.players.length >= MIN_PLAYERS_TO_LAUNCH && (!!game.captainUserId || hostIsPlayer);

  const handleLaunch = () => {
    launchMutation.mutate(undefined, {
      onSuccess: () => {
        navigate(`/game/${gameId}`);
      },
    });
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
              <p className="info-box">
                Sin asignar todavía — elige un capitán antes de iniciar (el host solo lo es por defecto si también
                juega con un personaje desde el móvil).
              </p>
            )}
            {assignCaptainMutation.error && <p className="error-msg">{assignCaptainMutation.error.message}</p>}
          </div>
        )}

        {/* Unirse como jugador ya NO se hace desde ui-web (ni siquiera el host):
            esta pantalla es siempre el tablero de solo lectura, la única
            superficie desde la que se juega de verdad es mobile-app. */}

        {isHost && (
          <button
            className="btn-gold"
            style={{ marginTop: '0.75rem' }}
            onClick={handleLaunch}
            disabled={!canLaunch || launchMutation.isPending}
          >
            {launchMutation.isPending ? 'Iniciando...' : 'Iniciar partida'}
          </button>
        )}
        {isHost && !canLaunch && (
          <p className="info-box">
            {game.players.length < MIN_PLAYERS_TO_LAUNCH
              ? `Hacen falta al menos ${MIN_PLAYERS_TO_LAUNCH} jugadores para iniciar la partida.`
              : 'Elige un capitán para poder iniciar la partida.'}
          </p>
        )}

        {launchMutation.error && <p className="error-msg">{launchMutation.error.message}</p>}
      </div>
    </div>
  );
}
