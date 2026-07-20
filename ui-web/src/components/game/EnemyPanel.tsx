import type { EncounterEnemy, RoundPhase, Player } from '../../types/api';

interface EnemyPanelProps {
  enemies: EncounterEnemy[];
  roundPhase: RoundPhase;
  turnClaim: string | null;
  players: Player[];
}

/**
 * ui-web ya no deja atacar desde aquí (eso ahora es "Tirar Dados" +
 * el campo de acción del móvil, ver SendPlayerActionUseCase) — este panel
 * solo informa: en qué fase está la ronda y quién tiene el turno reclamado.
 */
export function EnemyPanel({ enemies, roundPhase, turnClaim, players }: EnemyPanelProps) {
  const turnPlayer = turnClaim ? players.find((p) => p.characterId === turnClaim) : undefined;
  // Solo se muestran los que sí tienen imagen en el catálogo (no todo el SRD
  // trae arte oficial) -- mejor omitir un enemigo que mostrar un hueco roto.
  const enemiesWithImage = enemies.filter((e) => e.imageUrl);

  return (
    <div className="enemy-panel">
      <h3 className="section-title">Combate</h3>
      <p className="turn-hint">
        {roundPhase === 'jugadores'
          ? turnPlayer
            ? `Turno de: ${turnPlayer.name}`
            : 'Ronda de jugadores — esperando que alguien reclame turno desde el móvil...'
          : 'El DM está resolviendo el turno de los enemigos...'}
      </p>
      <div className="enemy-list">
        {enemies.map((enemy) => (
          <div key={enemy.instanceId} className="enemy-item">
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
      {enemiesWithImage.length > 0 && (
        <div className="enemy-portraits">
          {enemiesWithImage.map((enemy) => (
            <div key={enemy.instanceId} className="enemy-portrait-card" title={enemy.name}>
              <img src={enemy.imageUrl!} alt={enemy.name} className="enemy-portrait-image" />
              <span className="enemy-portrait-name">{enemy.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
