import { useNavigate } from 'react-router-dom';

/**
 * Overlay de fin de partida por muerte de todo el grupo (ver
 * Game.checkForPartyWipe en el backend, que pone status: 'finalizada' en
 * cuanto el último jugador con vida llega a 0 HP). Antes no existía ningún
 * cierre: la partida se quedaba "viva" con todos los jugadores muertos y el
 * DM-IA no sabía cómo reaccionar, lo que se veía en pantalla como el error
 * genérico "El DM-IA no ha podido responder ahora mismo" en vez de un final
 * claro. A diferencia de DmThinkingOverlay (que rota frases y desaparece
 * solo), este overlay muestra un único mensaje fijo y NO desaparece por sí
 * mismo -- la partida ha terminado de verdad, así que la única salida es
 * volver al menú.
 */
export function GameOverOverlay() {
  const navigate = useNavigate();

  return (
    <div className="game-over-overlay" role="alertdialog" aria-live="assertive">
      <div className="game-over-box">
        <div className="game-over-visual" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="game-over-skull">
            <path
              d="M50 8c-19 0-33 14-33 32 0 12 6 20 12 26v10c0 3 2 5 5 5h4v-8h4v8h8v-8h4v8h4c3 0 5-2 5-5V66c6-6 12-14 12-26C83 22 69 8 50 8z"
              fill="var(--color-danger)"
              stroke="#1a0505"
              strokeWidth="2.5"
            />
            <ellipse cx="36" cy="44" rx="8" ry="10" fill="#1a0505" />
            <ellipse cx="64" cy="44" rx="8" ry="10" fill="#1a0505" />
            <path d="M50 52 L44 64 L56 64 Z" fill="#1a0505" />
            <path
              d="M32 74 q18 8 36 0"
              fill="none"
              stroke="#1a0505"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="game-over-title">La aventura ha terminado</p>
        <p className="game-over-text">
          💀 Todo el grupo ha caído en combate. Ningún jugador quedó en pie para continuar la historia.
        </p>
        <button className="btn-gold game-over-btn" onClick={() => navigate('/')}>
          Volver al menú
        </button>
      </div>
    </div>
  );
}
