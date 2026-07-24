import { useRef, useEffect, useState, Fragment } from 'react';
import type { DmEngineChatMessage } from '../../types/api';
import { useSynthesizeSpeech } from '../../api/hooks';

interface ChatPanelProps {
  messages: DmEngineChatMessage[];
  /** Solo se usa para el arranque automático de la escena inicial — ya no hay
   * campo de texto aquí: los jugadores escriben desde el móvil (ver
   * SendPlayerActionUseCase), esta pantalla solo muestra lo que el DM narra
   * (y el eco de lo que escribió cada jugador). */
  isLoading?: boolean;
  /** Error de red/servidor al intentar enviar el mensaje (no el fallback narrativo
   * de SendMessageUseCase, que ya llega como un mensaje `assistant` normal). */
  errorMessage?: string;
}

/**
 * El DM-IA suele resaltar términos clave con la sintaxis Markdown de negrita
 * (**así**) y a veces separa ideas con líneas en blanco — sin este parseo se
 * veían los asteriscos literales y todo el texto caía en un único bloque
 * apelotonado. Se parsea a mano (sin dependencias de Markdown completas) para
 * mantener el control total sobre qué se soporta: solo negrita y párrafos.
 */
function renderFormattedContent(content: string) {
  const paragraphs = content.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const effectiveParagraphs = paragraphs.length > 0 ? paragraphs : [content];

  return effectiveParagraphs.map((paragraph, pIdx) => {
    const parts = paragraph.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0);
    return (
      <p key={pIdx}>
        {parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          return <Fragment key={i}>{part}</Fragment>;
        })}
      </p>
    );
  });
}

/** Quita la sintaxis Markdown (**negrita**) antes de pasarle el texto al TTS -- si no, lee los asteriscos en voz alta. */
function stripMarkdownForSpeech(content: string): string {
  return content.replace(/\*\*/g, '');
}

/**
 * SendPlayerActionUseCase antepone el nombre del personaje que actúa (ej.
 * "**Sandra:** Ataco al goblin con mi daga") -- antes, cualquier acción de
 * cualquier jugador se veía bajo la misma etiqueta genérica "Jugador", sin
 * forma de saber quién había escrito qué (más confuso aún ahora que varios
 * jugadores pueden tener el turno reclamado a la vez). Si el mensaje trae
 * ese prefijo, se usa como etiqueta y se retira del cuerpo para no duplicar
 * el nombre; si no (ej. tiradas de dados, que ya llevan el nombre en negrita
 * dentro del propio texto, o partidas/mensajes antiguos sin este prefijo),
 * se cae de vuelta a la etiqueta genérica "Jugador".
 */
function extractPlayerLabel(content: string): { label: string; body: string } {
  const match = content.match(/^\*\*([^*]+):\*\*\s*/);
  if (match) {
    return { label: match[1], body: content.slice(match[0].length) };
  }
  return { label: 'Jugador', body: content };
}

export function ChatPanel({ messages, isLoading, errorMessage }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const synthesizeSpeech = useSynthesizeSpeech();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  // Sin esto el chat se queda quieto cuando llega narración nueva y hay que
  // bajar a mano para leer — con cada mensaje nuevo (o mientras el DM
  // describe la escena inicial) baja solo hasta el final.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Corta la narración en voz alta si se sale de la pantalla mientras suena.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  function stopSpeaking() {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeakingIndex(null);
  }

  function handleToggleSpeak(index: number, content: string) {
    if (speakingIndex === index) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    synthesizeSpeech.mutate(
      { text: stripMarkdownForSpeech(content) },
      {
        onSuccess: ({ audioBase64 }) => {
          const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
          audioRef.current = audio;
          setSpeakingIndex(index);
          audio.addEventListener('ended', () => setSpeakingIndex(null));
          audio.play();
        },
      },
    );
  }

  return (
    <div className="chat-panel">
      {/* Aviso fijo (a petición del usuario) para que los jugadores escriban
       * respuestas concretas al DM en vez de mensajes ambiguos que el
       * modelo pueda malinterpretar -- siempre visible, fuera del área con
       * scroll de chat-messages, justo encima del título "Partida". */}
      <p className="chat-panel-notice">
        Escribe respuestas lo mas explícitas posible, nada de ambigüedades
      </p>
      <h3 className="chat-panel-title">Partida</h3>
      <div className="chat-messages">
        {messages.map((m, i) => {
          const { label, body } = m.role === 'user'
            ? extractPlayerLabel(m.content)
            : { label: 'DM', body: m.content };
          return (
            <div key={i} className={`chat-message ${m.role}`}>
              <span className="chat-message-role">
                {label}
                {m.role === 'assistant' && (
                  <button
                    type="button"
                    className="chat-speak-btn"
                    onClick={() => handleToggleSpeak(i, m.content)}
                    disabled={synthesizeSpeech.isPending && speakingIndex !== i}
                    title="Escuchar al DM"
                  >
                    {speakingIndex === i ? '⏹' : '🔊'}
                  </button>
                )}
              </span>
              {renderFormattedContent(body)}
            </div>
          );
        })}
        {isLoading && (
          <div className="chat-message assistant pending">
            <span className="chat-message-role">DM</span>
            <p>El DM está pensando...</p>
          </div>
        )}
        {synthesizeSpeech.isError && (
          <p className="chat-speak-error">{synthesizeSpeech.error.message}</p>
        )}
        {errorMessage && !isLoading && (
          <div className="chat-message assistant pending">
            <span className="chat-message-role">DM</span>
            <p>No se ha podido contactar con el servidor ({errorMessage}). Inténtalo de nuevo.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
