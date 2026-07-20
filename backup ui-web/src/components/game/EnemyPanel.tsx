import type { EncounterEnemy, InitiativeEntry } from '../../types/api';
import './EnemyPanel.css';

interface EnemyPanelProps {
  enemies: EncounterEnemy[];
  initiativeOrder: InitiativeEntry[];
  currentTurnIndex: number;
  onAttack: (targetId: string, ac: number) => void;
  isLoading: boolean;
  myCharacterId: string | undefined;
}

export function EnemyPanel({ enemies, initiativeOrder, currentTurnIndex, onAttack, isLoading, myCharacterId }: EnemyPanelProps) {
  const currentEntry = initiativeOrder[currentTurnIndex];
  const isMyTurn = currentEntry?.participantId === myCharacterId;

  return (
    <div className="enemy-panel">
      <div className="turn-order">
        {initiativeOrder.map((entry, i) => {
          const isCurrent = i === currentTurnIndex;
          const label = entry.participantId === myCharacterId
            ? 'Tu'
            : entry.type === 'enemigo'
              ? enemies.find((e) => e.instanceId === entry.participantId)?.name ?? entry.participantId.slice(-6)
              : entry.participantId.slice(-6);
          return (
            <span key={i} className={`turn-badge ${entry.type} ${isCurrent ? 'current' : ''}`}>
              {label} ({entry.initiative})
            </span>
          );
        })}
      </div>

      <div className="enemy-list">
        {enemies.map((enemy) => {
          const hpPct = Math.max(0, Math.min(100, (enemy.currentHp / Math.max(enemy.currentHp, 10)) * 100));
          return (
            <div key={enemy.instanceId} className="enemy-card">
              <h4>{enemy.name}</h4>
              <span className="stat">CA {enemy.ac}</span>
              <span className="stat">HP {enemy.currentHp}</span>
              <div className="hp-bar">
                <div className="hp-fill" style={{ width: `${hpPct}%` }} />
              </div>
              {isMyTurn && (
                <button
                  className="attack-btn"
                  onClick={() => onAttack(enemy.instanceId, enemy.ac)}
                  disabled={isLoading}
                >
                  {isLoading ? '...' : 'Atacar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
