import './DiceRollPanel.css';

interface DiceResult {
  id: number;
  result: unknown;
}

interface DiceRollPanelProps {
  results: DiceResult[];
}

export function DiceRollPanel({ results }: DiceRollPanelProps) {
  return (
    <div className="dice-panel">
      <h3>Tiradas</h3>
      <div className="dice-results">
        {results.length === 0 && <span className="no-results">Sin tiradas aun</span>}
        {results.map((r) => (
          <div key={r.id} className="dice-result">
            {JSON.stringify(r.result)}
          </div>
        ))}
      </div>
    </div>
  );
}
