import { useEffect } from 'react';
import { useLocation, matchPath } from 'react-router-dom';
import { useGame } from '../api/hooks';
import { playTrack } from './musicController';

/**
 * Decide qué pista de fondo debe sonar según la pantalla actual y, si estamos
 * dentro de una partida, según el mapa cargado y si hay combate activo.
 * Montado UNA vez en App.tsx (fuera de las Routes, siempre presente) para
 * que sobreviva a la navegación entre pantallas sin desmontarse.
 *
 * No añade una petición de red extra: useGame(gameId) usa la misma
 * queryKey ['game', gameId] que ya usa GameScreen, así que React Query
 * comparte la caché y el sondeo entre ambos componentes.
 */
export function BackgroundMusicController() {
  const location = useLocation();
  // matchPath con end:true para no confundir /game/:gameId (partida en
  // curso) con /game/:gameId/lobby (sala de espera, que también debe sonar
  // con la pista inicial, no con la de mapas).
  const gameMatch = matchPath({ path: '/game/:gameId', end: true }, location.pathname);
  const gameId = gameMatch?.params.gameId;

  const { data: game } = useGame(gameId);

  useEffect(() => {
    if (!gameId) {
      // Pantallas de portada: login, tus partidas, sala de espera.
      playTrack('inicial');
      return;
    }
    if (!game) return; // aún cargando la partida -- deja sonar lo que ya sonaba

    const aliveEnemies = game.activeEncounter?.enemies.filter((e) => e.currentHp > 0) ?? [];
    const inCombat = !!game.activeEncounter && aliveEnemies.length > 0;

    if (inCombat) {
      playTrack('combate');
      return;
    }

    const imageUrl = game.board.imageUrl ?? '';
    if (imageUrl.includes('tabernaMercenarios')) {
      playTrack('taberna');
    } else if (imageUrl.includes('tablonAnuncios')) {
      playTrack('inicial');
    } else if (imageUrl) {
      playTrack('battleMaps');
    } else {
      // Todavía no se ha cargado ningún mapa (inicio de la historia, de pie
      // en la calle del pueblo antes de elegir taberna o tablón).
      playTrack('inicial');
    }
  }, [gameId, game]);

  return null;
}
