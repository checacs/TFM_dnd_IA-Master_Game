import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { useAuth } from '../auth/useAuth';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const auth = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: (data) => {
          auth.login(data.token);
          navigate('/');
        },
      },
    );
  };

  return (
    <div className="full-bleed-screen">
      <div className="full-bleed-card">
        <img src="/logo_dnd.png" alt="Dungeons & Dragons" className="brand-logo" />
        <h1>D&amp;D con IA Master</h1>
        <p className="subtitle">Inicia sesión para continuar tu aventura</p>

        <form onSubmit={handleSubmit}>
          <div className="field-group">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="tu nombre de usuario"
              autoFocus
            />
          </div>
          <div className="field-group">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn-gold" disabled={!username || !password || login.isPending}>
            {login.isPending ? 'Entrando...' : 'Entrar'}
          </button>
          {login.error && <p className="error-msg">{login.error.message}</p>}
        </form>
      </div>
    </div>
  );
}
