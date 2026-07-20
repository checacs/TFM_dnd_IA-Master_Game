import { useState, useRef, useEffect, type FormEvent } from 'react';
import type { DmEngineChatMessage } from '../../types/api';
import './ChatPanel.css';

interface ChatPanelProps {
  messages: DmEngineChatMessage[];
  onSend: (content: string) => void;
  isLoading: boolean;
}

export function ChatPanel({ messages, onSend, isLoading }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            Escribe para hablar con el Dungeon Master...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="role-label">{msg.role === 'user' ? 'Tu' : 'DM'}</div>
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="chat-msg assistant">
            <div className="role-label">DM</div>
            <em>El DM esta pensando...</em>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="chat-input-area" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Que haces?"
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}>
          Enviar
        </button>
      </form>
    </div>
  );
}
