interface DiceRollPanelProps {
  results: { id: number; result: unknown }[];
}

function formatResult(result: unknown): string {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if ('notation' in r && 'result' in r) {
      return `${String(r.notation)} → ${String(r.result)}`;
    }
    if ('result' in r) {
      return String(r.result);
    }
  }
  return String(result);
}

export function DiceRollPanel({ results }: DiceRollPanelProps) {
  const last = results.slice(-5).reverse();

  return (
    <div className="dice-roll-panel">
      {last.length === 0 ? (
        <span className="dice-roll-empty">Sin tiradas aún</span>
      ) : (
        <div className="dice-roll-list">
          {last.map((r) => (
            <span key={r.id} className="dice-roll-chip">{formatResult(r.result)}</span>
          ))}
        </div>
      )}
    </div>
  );
}
