import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, getVolume, setVolume, subscribe } from './musicController';
import './MusicControl.css';

/** Icono flotante visible en todas las pantallas (montado una sola vez en
 * App.tsx) para silenciar/reanudar la música de fondo y bajar el volumen. */
export function MusicControl() {
  const muted = useSyncExternalStore(subscribe, isMuted);
  const volume = useSyncExternalStore(subscribe, getVolume);

  return (
    <div className="music-control">
      <button
        type="button"
        className="music-control-btn"
        onClick={() => setMuted(!muted)}
        aria-label={muted ? 'Activar música' : 'Silenciar música'}
        title={muted ? 'Activar música' : 'Silenciar música'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <input
        type="range"
        className="music-control-volume"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volumen de la música"
        title="Volumen de la música"
      />
    </div>
  );
}
