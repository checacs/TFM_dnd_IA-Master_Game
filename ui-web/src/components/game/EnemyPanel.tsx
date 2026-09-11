import type { EncounterEnemy, RoundPhase, Player } from '../../types/api';

interface EnemyPanelProps {
  enemies: EncounterEnemy[];
  roundPhase: RoundPhase;
  /** characterIds con turno reclamado -- ya no es exclusivo, puede haber varios a la vez. */
  turnClaims: string[];
  players: Player[];
}

/**
 * ui-web ya no deja atacar desde aquí (eso ahora es "Tirar Dados" +
 * el campo de acción del móvil, ver SendPlayerActionUseCase) — este panel
 * solo informa: en qué fase está la ronda y quién tiene el turno reclamado.
 */
export function EnemyPanel({ enemies, roundPhase, turnClaims, players }: EnemyPanelProps) {
  const turnPlayers = turnClaims
    .map((id) => players.find((p) => p.characterId === id))
    .filter((p): p is Player => !!p);

  return (
    <div className="enemy-panel">
      <h3 className="section-title">Combate</h3>
      <p className="turn-hint">
        {roundPhase === 'jugadores'
          ? turnPlayers.length > 0
            ? `Turno de: ${turnPlayers.map((p) => p.name).join(', ')}`
            : 'Ronda de jugadores — esperando que alguien reclame turno desde el móvil...'
          : 'El DM está resolviendo el turno de los enemigos...'}
      </p>
      <div className="enemy-list">
        {enemies.map((enemy) => (
          <div key={enemy.instanceId} className="enemy-item">
            {/* Retrato a la izquierda (esta caja vive en la columna estrecha
                del roster, ver BoardPanel/belowRoster) -- se pinta solo si el
                enemigo tiene imagen en el catálogo. Se dimensiona al ancho de
                esta columna estrecha (no a 320px como se probó antes) para
                que no haga falta hacer scroll para verlo. */}
            {enemy.imageUrl && (
              <img src={enemy.imageUrl} alt={enemy.name} className="enemy-item-portrait" />
            )}
            <div className="enemy-item-info">
              <span className="enemy-name">{enemy.name}</span>
              <span className="enemy-hp">HP {enemy.currentHp}</span>
              {enemy.conditions.length > 0 && (
                <span className="enemy-conditions">{enemy.conditions.join(', ')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
