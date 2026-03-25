import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Evita pantalla en blanco si un render lanza; muestra el error en desarrollo. */
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("RootErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: "1.5rem",
            fontFamily: "system-ui, sans-serif",
            maxWidth: 560,
            margin: "2rem auto"
          }}
        >
          <h1 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            Error al cargar la aplicación
          </h1>
          <pre
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              padding: "0.75rem",
              fontSize: 12,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}
          >
            {this.state.error.message}
          </pre>
          <p style={{ marginTop: "1rem", fontSize: 14, color: "#64748b" }}>
            Recargá la página (F5). Si persiste, revisá la consola del navegador
            (F12).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
