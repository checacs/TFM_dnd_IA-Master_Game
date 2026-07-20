import { useMemo } from 'react';
import type { Board, Player, EncounterEnemy, BoardPosition } from '../../types/api';
import './BoardPanel.css';

interface BoardPanelProps {
  board: Board;
  players: Player[];
  enemies: EncounterEnemy[];
  mapImageUrl: string | null;
}

interface PositionedMarker {
  type: 'player' | 'enemy';
  label: string;
  position: BoardPosition;
}

/** Centro de la celda en % dentro del wrapper — el wrapper fuerza aspect-ratio = cols/rows, así que la imagen (object-fit: contain) llena el hueco sin bandas y el % coincide con la celda real. */
function cellToPercent(position: BoardPosition, board: Board) {
  return {
    left: `${((position.col + 0.5) / board.cols) * 100}%`,
    top: `${((position.row + 0.5) / board.rows) * 100}%`,
  };
}

export function BoardPanel({ board, players, enemies, mapImageUrl }: BoardPanelProps) {
  const markers = useMemo(() => {
    const result: { type: 'player' | 'enemy'; label: string }[] = [];
    players.forEach((p) => result.push({ type: 'player', label: p.name[0].toUpperCase() }));
    enemies.forEach((e) => result.push({ type: 'enemy', label: e.name[0].toUpperCase() }));
    return result;
  }, [players, enemies]);

  const positionedMarkers = useMemo(() => {
    const result: PositionedMarker[] = [];
    players.forEach((p) => {
      if (p.position) result.push({ type: 'player', label: p.name[0].toUpperCase(), position: p.position });
    });
    enemies.forEach((e) => {
      if (e.position) result.push({ type: 'enemy', label: e.name[0].toUpperCase(), position: e.position });
    });
    return result;
  }, [players, enemies]);

  const cells: ('player' | 'enemy' | null)[] = Array.from({ length: board.rows * board.cols }, () => null);

  let po = 0;
  for (let i = 0; i < cells.length && po < players.length; i++) {
    cells[i] = 'player'; po++;
  }
  let eo = 0;
  for (let i = 0; i < cells.length && eo < enemies.length; i++) {
    if (cells[i] === null) { cells[i] = 'enemy'; eo++; }
  }

  return (
    <div className="board-panel">
      <h3>Tablero</h3>
      {mapImageUrl ? (
        <div className="board-map-outer">
          <div className="board-map-wrapper" style={{ aspectRatio: `${board.cols} / ${board.rows}` }}>
            <img src={mapImageUrl} alt="Mapa de batalla" className="board-map-image" />
            {positionedMarkers.map((m, i) => (
              <span
                key={i}
                className={`board-map-marker ${m.type}`}
                style={cellToPercent(m.position, board)}
                title={m.label}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="board-grid"
          style={{
            gridTemplateColumns: `repeat(${board.cols}, 32px)`,
            gridTemplateRows: `repeat(${board.rows}, 32px)`,
          }}
        >
          {cells.map((cell, i) => (
            <div key={i} className={`board-cell ${cell ?? ''}`}>
              {cell ? cell[0].toUpperCase() : ''}
            </div>
          ))}
        </div>
      )}
      {markers.length > 0 && (
        <div className="markers">
          {markers.map((m, i) => (
            <span key={i} className={`marker ${m.type}`}>{m.label}</span>
          ))}
        </div>
      )}
      <div className="legend">
        <span className="legend-item"><span className="legend-dot player" /> Jugador</span>
        <span className="legend-item"><span className="legend-dot enemy" /> Enemigo</span>
      </div>
    </div>
  );
}
