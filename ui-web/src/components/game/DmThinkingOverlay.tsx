import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Frases épicas que rotan mientras el turno del DM-IA está en marcha (ver
 * game.dmTurnInProgress, expuesto por Game.startDmTurn/endDmTurn en el
 * backend). La llamada real a dm-engine tarda entre 20 y 40 segundos, y sin
 * nada en pantalla esa espera se sentía eterna -- ahora ui-web (que ya solo
 * es una pantalla de solo lectura: las acciones llegan del móvil) muestra
 * esto para que la espera se sienta parte de la narración en vez de un
 * bloqueo técnico.
 */
const DM_THINKING_PHRASES = [
  'El Master hojea manuscritos olvidados, buscando el hilo que teje tu destino...',
  'Las sombras del Multiverso susurran al oído del Master, revelando lo que está por venir...',
  'El Master lanza los dados del destino en la penumbra: el eco todavía no ha vuelto...',
  'Runas ancestrales se encienden sobre la mesa del Master, moldeando la escena que viviréis...',
  'El Master convoca a los ecos de mil aventuras pasadas para guiar esta historia...',
  'El velo entre los mundos se agita: el Master decide qué peligro despierta ahora...',
  'La pluma del Master araña el pergamino eterno, escribiendo el siguiente capítulo...',
  'Las estrellas se realinean sobre el tablero: el Master interpreta sus designios...',
  'El Master consulta al oráculo de las sombras, sopesando el peso de tu decisión...',
  'Un rugido lejano resuena en la Cámara del Master: algo se está gestando...',
];

const ROTATE_INTERVAL_MS = 3400;

/**
 * Chispas mágicas alrededor del d20 -- cada una viaja en una dirección
 * distinta (--tx/--ty, leídas por @keyframes dm-thinking-sparkle-float en
 * index.css) y arranca con su propio retraso para que no parpadeen todas a
 * la vez, sino como una lluvia de motas continua.
 */
const SPARKLES: { tx: string; ty: string; delay: string }[] = [
  { tx: '38px', ty: '-30px', delay: '0s' },
  { tx: '-34px', ty: '-26px', delay: '0.4s' },
  { tx: '30px', ty: '32px', delay: '0.8s' },
  { tx: '-36px', ty: '28px', delay: '1.2s' },
  { tx: '0px', ty: '-42px', delay: '1.6s' },
];

/** CSSProperties no tipa las custom properties (--tx/--ty) -- se amplía a mano para pasarlas sin `as any`. */
type SparkleStyle = CSSProperties & { '--tx': string; '--ty': string };

interface DmThinkingOverlayProps {
  /** true mientras haya un turno del DM-IA en marcha (propio o disparado desde el móvil). */
  active: boolean;
}

export function DmThinkingOverlay({ active }: DmThinkingOverlayProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  // Al reactivarse, siempre arranca por la primera frase -- si empezara por
  // donde se quedó la vez anterior, dos turnos seguidos rara vez mostrarían
  // la misma frase inicial y perdería consistencia como "apertura" del ritual.
  useEffect(() => {
    if (!active) return;
    setPhraseIndex(0);
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % DM_THINKING_PHRASES.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <div className="dm-thinking-overlay" role="status" aria-live="polite">
      <div className="dm-thinking-box">
        {/* d20 girando + chispas mágicas -- puramente CSS/SVG (sin ficheros de
            imagen que mantener ni depender de que carguen) para darle algo de
            vida a la espera, a petición del usuario ("un png con movimiento o
            algo así para que sea más divertido"). El bounce vive en el div
            contenedor y el giro en el <svg> por separado porque dos
            animaciones que tocan la misma propiedad transform en el MISMO
            elemento no se combinan en CSS -- la segunda pisaría a la
            primera. */}
        <div className="dm-thinking-visual" aria-hidden="true">
          <svg className="dm-thinking-die" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="dm-die-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--color-gold-bright)" />
                <stop offset="100%" stopColor="var(--color-gold)" />
              </linearGradient>
            </defs>
            <polygon
              points="50,6 87,28 87,72 50,94 13,72 13,28"
              fill="url(#dm-die-gradient)"
              stroke="#241a08"
              strokeWidth="2"
            />
            <polygon
              points="50,6 87,28 87,72 50,94 13,72 13,28"
              fill="none"
              stroke="#241a08"
              strokeWidth="1"
              opacity="0.5"
              transform="translate(22,22) scale(0.56)"
            />
            {[
              [50, 6], [87, 28], [87, 72], [50, 94], [13, 72], [13, 28],
            ].map(([x, y]) => (
              <line key={`${x}-${y}`} x1="50" y1="50" x2={x} y2={y} stroke="#241a08" strokeWidth="1" opacity="0.45" />
            ))}
            <text x="50" y="59" textAnchor="middle" fontSize="28" fontWeight="bold" fill="#241a08">
              20
            </text>
          </svg>
          {SPARKLES.map((s, i) => (
            <span
              key={i}
              className="dm-thinking-sparkle"
              style={{ '--tx': s.tx, '--ty': s.ty, animationDelay: s.delay } as SparkleStyle}
            />
          ))}
        </div>
        <p className="dm-thinking-title">El Master está tejiendo la historia</p>
        {/* key fuerza el remount al cambiar de frase, para que la animación de
            entrada (dm-thinking-text-fade) se repita en cada rotación en vez
            de solo la primera vez que aparece el overlay. */}
        <p className="dm-thinking-text" key={phraseIndex}>
          {DM_THINKING_PHRASES[phraseIndex]}
        </p>
      </div>
    </div>
  );
}
