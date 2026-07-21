import { useMemo, type ReactNode } from 'react';
import type { Board, Player, EncounterEnemy, BoardPosition } from '../../types/api';

interface BoardPanelProps {
  board: Board;
  players: Player[];
  enemies: EncounterEnemy[];
  mapImageUrl: string | null;
  /** La caja de combate (EnemyPanel) se pasa aquí en vez de renderizarse como
   * panel aparte debajo — así queda pegada al roster de jugadores/enemigos en
   * la misma columna estrecha, en lugar de duplicar la lista de enemigos en
   * una caja ancha separada. */
  belowRoster?: ReactNode;
}

interface PositionedMarker {
  type: 'player' | 'enemy';
  label: string;
  position: BoardPosition;
}

/**
 * Centro de la celda en % dentro del wrapper. El wrapper se dimensiona con
 * aspect-ratio = cols/rows (ver CSS .board-map-wrapper) exactamente igual que
 * lo haría una imagen con object-fit:contain, pero en la propia caja — así no
 * queda letterboxing entre el borde del wrapper y la imagen real, y el % de
 * cada marcador coincide con la celda real de la cuadrícula del mapa.
 */
function cellToPercent(position: BoardPosition, board: Board) {
  return {
    left: `${((position.col + 0.5) / board.cols) * 100}%`,
    top: `${((position.row + 0.5) / board.rows) * 100}%`,
  };
}

export function BoardPanel({ board, players, enemies, mapImageUrl, belowRoster }: BoardPanelProps) {
  // Solo se muestran los que sí tienen imagen en el catálogo (no todo el SRD
  // trae arte oficial) -- mejor omitir un enemigo que mostrar un hueco roto.
  // Se pintan aquí (a todo el ancho del panel) y no en la columna estrecha de
  // 190px del roster, porque ahí la imagen se quedaba demasiado pequeña para
  // distinguir de qué tipo de enemigo se trata.
  const enemiesWithImage = enemies.filter((e) => e.imageUrl);

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
  for (let i = 0; i < cells.length && po < players.length; i++) { cells[i] = 'player'; po++; }
  let eo = 0;
  for (let i = 0; i < cells.length && eo < enemies.length; i++) {
    if (cells[i] === null) { cells[i] = 'enemy'; eo++; }
  }

  return (
    <div className="board-panel">
      <h3 className="section-title">Jugadores</h3>
      <div className="board-panel-body">
        <div className="board-players-column">
          {/* Solo jugadores reales aquí — los enemigos ya tienen su propia caja
              de Combate (belowRoster/EnemyPanel) justo debajo; listarlos
              también aquí los hacía parecer jugadores más y duplicaba la
              información. */}
          <ul className="board-player-list">
            {players.map((p) => (
              <li key={p.characterId} className="board-player-card">
                <span className="board-player-name">{p.name}</span>
                <span className="board-player-class">{p.class}</span>
                <span className="board-player-hp">HP {p.currentHp}</span>
                {p.conditions.length > 0 && (
                  <span className="board-player-conditions">{p.conditions.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="legend">
            <span className="legend-item"><span className="legend-dot player" /> Jugador</span>
            <span className="legend-item"><span className="legend-dot enemy" /> Enemigo</span>
          </div>
          {belowRoster}
        </div>
        <div className="board-map-column">
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
                gridTemplateColumns: `repeat(${board.cols}, 28px)`,
                gridTemplateRows: `repeat(${board.rows}, 28px)`,
              }}
            >
              {cells.map((cell, i) => (
                <div key={i} className={`board-cell ${cell ?? ''}`}>
                  {cell ? cell[0].toUpperCase() : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {enemiesWithImage.length > 0 && (
        <div className="enemy-portraits-wide">
          {enemiesWithImage.map((enemy) => (
            <div key={enemy.instanceId} className="enemy-portrait-card-wide" title={enemy.name}>
              <img src={enemy.imageUrl!} alt={enemy.name} className="enemy-portrait-image-wide" />
              <span className="enemy-portrait-name-wide">{enemy.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
