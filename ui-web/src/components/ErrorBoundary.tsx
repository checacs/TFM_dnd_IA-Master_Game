import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Sin esto, cualquier excepción de render en una pantalla (por ejemplo un
 * dato inesperado del backend) tira abajo TODO el árbol de React y deja la
 * página en blanco sin ninguna pista de qué falló ni dónde — exactamente lo
 * que nos costó horas de diagnóstico a ciegas la primera vez. Con este
 * boundary, al menos se ve el error y se puede reintentar sin recargar
 * perdiendo el estado de otras partes de la app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('[ui-web] Error no capturado en el árbol de React:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <h2>Algo ha ido mal</h2>
            <p>{this.state.error.message}</p>
            <button onClick={() => this.setState({ error: null })}>Reintentar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
