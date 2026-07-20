import { useState, useReducer, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame, useSendMessage, usePlayerAttack, useCharacter } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import { ChatPanel } from '../components/game/ChatPanel';
import { BoardPanel } from '../components/game/BoardPanel';
import { EnemyPanel } from '../components/game/EnemyPanel';
import { DiceRollPanel } from '../components/game/DiceRollPanel';
import type { DmEngineChatMessage, GameEvent, NarrativeEntry } from '../types/api';
import './GameScreen.css';

interface GameViewState {
  latestNarrative: string;
  events: GameEvent[];
  diceResults: { id: number; result: unknown }[];
}

type GameViewAction =
  | { type: 'narrative'; text: string }
  | { type: 'events'; events: GameEvent[] }
  | { type: 'dice_result'; result: unknown };

let diceIdCounter = 0;

function gameViewReducer(state: GameViewState, action: GameViewAction): GameViewState {
  switch (action.type) {
    case 'narrative':
      return { ...state, latestNarrative: action.text };
    case 'events': {
      const diceResults = action.events
        .filter((e) => e.type === 'tirada_realizada')
        .map((e) => ({ id: ++diceIdCounter, result: e.payload }));
      return { ...state, events: [...state.events, ...action.events], diceResults: [...state.diceResults, ...diceResults] };
    }
    case 'dice_result':
      return { ...state, diceResults: [...state.diceResults, { id: ++diceIdCounter, result: action.result }] };
    default:
      return state;
  }
}

function toChatMessages(log: NarrativeEntry[]): DmEngineChatMessage[] {
  return log.map((e) => ({ role: e.role, content: e.content }));
}

export function GameScreen() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: game } = useGame(gameId);
  const { token } = useAuth();
  const sendMessage = useSendMessage(gameId!);
  const playerAttack = usePlayerAttack(gameId!);
  const [loadedHistory, setLoadedHistory] = useState(false);
  const [chatHistory, setChatHistory] = useState<DmEngineChatMessage[]>([]);
  const [viewState, dispatch] = useReducer(gameViewReducer, {
    latestNarrative: '',
    events: [],
    diceResults: [],
  });
  const initialMessageSent = useRef(false);

  const userId = token ? JSON.parse(atob(token.split('.')[1])).userId : null;
  const myPlayer = game?.players.find((p) => p.userId === userId);
  const characterId = myPlayer?.characterId;
  const { data: character } = useCharacter(characterId);

  useEffect(() => {
    if (!game || !gameId) return;
    if (game.status !== 'en_curso') return;
    if (loadedHistory) return;

    if (game.narrativeLog && game.narrativeLog.length > 0) {
      setChatHistory(toChatMessages(game.narrativeLog));
      setLoadedHistory(true);
      return;
    }

    if (initialMessageSent.current) return;
    initialMessageSent.current = true;

    const initialMsg: DmEngineChatMessage = {
      role: 'user',
      content: 'La partida ha comenzado. Describe la escena inicial.',
    };
    const newMessages = [initialMsg];

    sendMessage.mutate(
      { messages: newMessages },
      {
        onSuccess: (data) => {
          setChatHistory([initialMsg, { role: 'assistant', content: data.narrative }]);
          setLoadedHistory(true);
          dispatch({ type: 'narrative', text: data.narrative });
          if (data.events.length > 0) {
            dispatch({ type: 'events', events: data.events });
          }
        },
        onError: (error) => {
          // Sin esto, si la llamada al DM falla (o hace timeout), el spinner
          // "El DM esta pensando..." desaparece pero no queda ningun rastro
          // de que algo fue mal.
          setChatHistory([
            initialMsg,
            { role: 'assistant', content: `(Error al contactar con el DM: ${error.message}. Escribe algo para reintentar.)` },
          ]);
        },
      },
    );
  }, [game?.narrativeLog, game?.status, gameId, loadedHistory]);

  const handleSendMessage = useCallback((content: string) => {
    const newMessages: DmEngineChatMessage[] = [...chatHistory, { role: 'user', content }];

    sendMessage.mutate(
      { messages: newMessages },
      {
        onSuccess: (data) => {
          setChatHistory([...newMessages, { role: 'assistant', content: data.narrative }]);
          dispatch({ type: 'narrative', text: data.narrative });
          if (data.events.length > 0) {
            dispatch({ type: 'events', events: data.events });
          }
        },
        onError: (error) => {
          // Igual que en el mensaje inicial: sin esto, el spinner desaparece
          // (isPending vuelve a false al rechazar la mutación) pero no queda
          // ningun rastro visible de que el turno fallo.
          setChatHistory([
            ...newMessages,
            { role: 'assistant', content: `(Error al contactar con el DM: ${error.message}. Intenta enviar el mensaje de nuevo.)` },
          ]);
        },
      },
    );
  }, [chatHistory, sendMessage]);

  const handleAttack = useCallback((targetId: string, targetArmorClass: number) => {
    if (!characterId) return;
    playerAttack.mutate(
      { attackerCharacterId: characterId, targetId, targetArmorClass },
      {
        onSuccess: (data) => {
          const msg = data.hit
            ? `Ataque con ${data.weaponName}: ${data.attackRoll} — Impacto. ${data.damage} pts de dano.`
            : `Ataque con ${data.weaponName}: ${data.attackRoll} — Fallo.`;
          setChatHistory((prev) => [
            ...prev,
            { role: 'user', content: `Ataco a ${targetId}` },
            { role: 'assistant', content: msg },
          ]);
          dispatch({ type: 'events', events: [{ type: 'ataque_resuelto', payload: data }] });
        },
      },
    );
  }, [characterId, playerAttack]);

  if (!game) {
    return (
      <div className="game-screen">
        <div className="loading-msg">Cargando partida...</div>
      </div>
    );
  }

  const mapImageUrl = game.board.imageUrl
    ? `${import.meta.env.VITE_API_URL ?? '/api'}${game.board.imageUrl}`
    : null;

  return (
    <div className="game-screen">
      <div className="game-left">
        <div className="game-top-bar">
          <h2>{game.name}</h2>
          <button className="back-btn" onClick={() => navigate('/')}>Salir</button>
        </div>
        <ChatPanel
          messages={chatHistory}
          onSend={handleSendMessage}
          isLoading={sendMessage.isPending}
        />
      </div>
      <div className="game-right">
        <BoardPanel
          board={game.board}
          players={game.players}
          enemies={game.activeEncounter?.enemies ?? []}
          mapImageUrl={mapImageUrl}
        />
        {game.activeEncounter && (
          <EnemyPanel
            enemies={game.activeEncounter.enemies}
            initiativeOrder={game.activeEncounter.initiativeOrder}
            currentTurnIndex={game.activeEncounter.currentTurnIndex}
            onAttack={handleAttack}
            isLoading={playerAttack.isPending}
            myCharacterId={characterId}
          />
        )}
        <DiceRollPanel results={viewState.diceResults} />
        {character && (
          <div className="character-sheet">
            <div className="char-info">
              <span className="char-name">{character.name}</span>
              <span>Nivel {character.level} {character.class}</span>
              {/*
                El HP "en vivo" durante la partida vive en game.players[].currentHp
                (lo actualizan resolve_attack/cast_spell/apply_condition, tanto si lo
                dispara la IA como el propio jugador). character.hp.current es la
                hoja persistente y nunca se toca en combate, así que si myPlayer
                existe usamos su HP; character.hp.max sigue siendo el tope real.
              */}
              <span>HP {myPlayer?.currentHp ?? character.hp.current}/{character.hp.max}</span>
              <span>CA {character.ac}</span>
              <span>XP {character.xp}</span>
            </div>
            {myPlayer && myPlayer.conditions.length > 0 && (
              <div className="char-conditions">
                {myPlayer.conditions.map((cond) => (
                  <span key={cond} className="condition-badge">{cond}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
