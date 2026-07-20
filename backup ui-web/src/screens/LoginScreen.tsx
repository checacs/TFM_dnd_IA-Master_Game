import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '../api/hooks';
import { useAuth } from '../auth/useAuth';
import './LoginScreen.css';

export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const mutation = useLogin();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    mutation.mutate({ username, password }, {
      onSuccess: (data) => {
        login(data.token);
        navigate('/');
      },
    });
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>D&D IA Master</h1>
        <p className="subtitle">Inicia sesion para jugar</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Contrasena</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="login-btn"
            disabled={!username || !password || mutation.isPending}
          >
            {mutation.isPending ? 'Entrando...' : 'Entrar'}
          </button>
          {mutation.error && (
            <p className="error-msg">{mutation.error.message}</p>
          )}
        </form>
      </div>
    </div>
  );
}
