import { assetUrl } from '../api/client';

/**
 * Música de fondo de la app: un único elemento <audio> a nivel de MÓDULO (no
 * de componente ni de hook) porque tiene que sobrevivir a los cambios de
 * ruta de react-router (Login -> creación de partida -> sala de espera ->
 * partida) sin cortarse ni reiniciarse solo por navegar entre pantallas. Si
 * viviera en un componente, cada desmontaje pausaría/perdería el audio.
 */
export type MusicTrackKey = 'inicial' | 'taberna' | 'battleMaps' | 'combate';

const TRACK_PATHS: Record<MusicTrackKey, string> = {
  inicial: '/music/bso_inicial.mp3',
  taberna: '/music/bso_taberna.mp3',
  battleMaps: '/music/bso_battleMaps.mp3',
  // Pendiente: falta el archivo assets/music/bso_combate.mp3 en el backend.
  // En cuanto se añada ahí, esta pista sonará sola en combate sin tocar
  // ningún código -- no hace falta cambiar nada más aquí.
  combate: '/music/bso_combate.mp3',
};

const STORAGE_KEY_MUTED = 'dnd-music-muted';
const STORAGE_KEY_VOLUME = 'dnd-music-volume';
const DEFAULT_VOLUME = 0.45;

let audioEl: HTMLAudioElement | null = null;
let currentTrack: MusicTrackKey | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

function attemptResume(el: HTMLAudioElement) {
  // Los navegadores bloquean el autoplay con sonido hasta que el usuario
  // interactúa con la página (click, tecla, tap). Si play() se rechaza por
  // eso, reintentamos en cuanto llegue la primera interacción, en vez de
  // dejar la música muerta para siempre.
  const resume = () => {
    el.play().catch(() => {});
  };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });
}

function getAudioEl(): HTMLAudioElement {
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.loop = true;
    const storedMuted = localStorage.getItem(STORAGE_KEY_MUTED);
    const storedVolume = localStorage.getItem(STORAGE_KEY_VOLUME);
    audioEl.muted = storedMuted === 'true';
    audioEl.volume = storedVolume !== null ? Number(storedVolume) : DEFAULT_VOLUME;
  }
  return audioEl;
}

/** Cambia a la pista indicada. Si ya es la que está sonando, no hace nada
 * (evita reiniciarla desde el principio en cada refetch/re-render). */
export function playTrack(track: MusicTrackKey) {
  const el = getAudioEl();
  if (currentTrack === track) return;
  currentTrack = track;
  el.src = assetUrl(TRACK_PATHS[track]);
  el.play().catch(() => attemptResume(el));
  notify();
}

export function getCurrentTrack(): MusicTrackKey | null {
  return currentTrack;
}

export function isMuted(): boolean {
  return getAudioEl().muted;
}

export function setMuted(muted: boolean) {
  const el = getAudioEl();
  el.muted = muted;
  localStorage.setItem(STORAGE_KEY_MUTED, String(muted));
  if (!muted) {
    // Si estaba pausado por el bloqueo de autoplay, aprovechamos este click
    // del usuario (activar sonido) para intentar reanudar la reproducción.
    el.play().catch(() => {});
  }
  notify();
}

export function getVolume(): number {
  return getAudioEl().volume;
}

export function setVolume(volume: number) {
  const el = getAudioEl();
  el.volume = volume;
  localStorage.setItem(STORAGE_KEY_VOLUME, String(volume));
  notify();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
