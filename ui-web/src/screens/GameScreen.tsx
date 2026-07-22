import { useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame, useSendMessage } from '../api/hooks';
import { assetUrl } from '../api/client';
import { ChatPanel } from '../components/game/ChatPanel';
import { BoardPanel } from '../components/game/BoardPanel';
import { EnemyPanel } from '../components/game/EnemyPanel';
import type { DmEngineChatMessage, NarrativeEntry } from '../types/api';
import './GameScreen.css';

/**
 * Guarda de módulo (no un ref del componente): en desarrollo, StrictMode monta
 * el componente, ejecuta los efectos, los limpia y vuelve a montar — con un
 * useRef normal, el segundo montaje crea una referencia nueva que empieza en
 * false otra vez, así que el efecto de abajo dispararía sendMessage.mutate()
 * dos veces para el mismo mensaje inicial. Un Set a nivel de módulo sobrevive
 * a ese remount porque no vive en el estado del componente.
 */
const initialMessageSentForGame = new Set<string>();

function toChatMessages(log: NarrativeEntry[]): DmEngineChatMessage[] {
  return log.map((e) => ({ role: e.role, content: e.content }));
}

/**
 * ui-web es ahora una pantalla de solo lectura: muestra lo que narra el DM
 * (y el eco de lo que escribió cada jugador), el mapa, los jugadores y el
 * estado del combate — pero ya no se escribe ni se ataca desde aquí. Eso
 * pasa por el móvil (claim-turn / player-action / player-roll, ver
 * SendPlayerActionUseCase). La única acción que sigue disparando esta
 * pantalla es el arranque automático de la escena inicial, que no requiere
 * texto de ningún jugador concreto.
 */
export function GameScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: game } = useGame(gameId);
  const sendMessage = useSendMessage(gameId!);

  const chatMessages = useMemo(
    () => (game ? toChatMessages(game.narrativeLog) : []),
    [game],
  );

  useEffect(() => {
    if (!game || !gameId) return;
    if (game.status !== 'en_curso') return;
    if (game.narrativeLog && game.narrativeLog.length > 0) return; // ya hay historia, nada que arrancar
    if (initialMessageSentForGame.has(gameId)) return;
    initialMessageSentForGame.add(gameId);

    sendMessage.mutate({
      messages: [{ role: 'user', content: 'La partida ha comenzado. Describe la escena inicial.' }],
    });
    // El siguiente sondeo de useGame recogerá la narrativa ya guardada en
    // game.narrativeLog — no hace falta guardar el resultado a mano aquí.
  }, [game, gameId, sendMessage]);

  if (!game) {
    return (
      <div className="game-screen">
        <div className="loading-msg">Cargando partida...</div>
      </div>
    );
  }

  const mapImageUrl = game.board.imageUrl ? assetUrl(game.board.imageUrl) : null;

  // Salvaguarda defensiva: se detectó en partida real que un combate quedaba
  // "fantasma" -- todos los enemigos ya a 0 HP (derrotados) pero el panel de
  // Combate y su marcador seguían mostrándose en el tablero indefinidamente,
  // porque nada en el backend cerraba activeEncounter tras la victoria. Hasta
  // que el DM-IA cierre el combate de verdad (end_combat), esta pantalla deja
  // de mostrar la caja de Combate y los marcadores de enemigos en cuanto no
  // queda ninguno con vida -- así una partida ya "atascada" se arregla sola
  // sin esperar a que el DM llame a ninguna tool nueva.
  const aliveEnemies = game.activeEncounter?.enemies.filter((e) => e.currentHp > 0) ?? [];
  const showCombat = !!game.activeEncounter && aliveEnemies.length > 0;

  return (
    <div className="game-screen">
      <div className="game-top-bar">
        <div className="game-title-group">
          <img src="/logo_dnd.png" alt="Dungeons & Dragons" className="game-logo-small" />
          <h2>La aventura: {game.name}</h2>
        </div>
        <button className="btn-ghost exit-btn" onClick={() => navigate('/')}>Salir</button>
      </div>
      <div className="game-body">
        <div className="game-left">
          <ChatPanel
            messages={chatMessages}
            isLoading={sendMessage.isPending}
            errorMessage={sendMessage.isError ? sendMessage.error.message : undefined}
          />
        </div>
        <div className="game-right">
          <BoardPanel
            board={game.board}
            players={game.players}
            enemies={showCombat ? game.activeEncounter!.enemies : []}
            mapImageUrl={mapImageUrl}
            belowRoster={
              showCombat && (
                <EnemyPanel
                  enemies={game.activeEncounter!.enemies}
                  roundPhase={game.activeEncounter!.roundPhase}
                  turnClaims={game.activeEncounter!.turnClaims}
                  players={game.players}
                />
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
