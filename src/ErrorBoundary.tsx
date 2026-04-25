import { Component, type ReactNode } from "react";

// ─── THEME (matches TradrAuth / TRADR warm editorial palette) ─────────────────
const C = {
  bg: "#0C0C0B",
  text: "#EDEDE8",
  text2: "#BCBCB4",
  muted: "#8A8A82",
  border2: "#3A3A34",
  red: "#FF3D00",
  blue: "#89cff0",
};
const DISPLAY = "'Syne', 'Inter', system-ui, sans-serif";
const BODY = "'Inter', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

interface Props { children: ReactNode; }
interface State { error: Error | null; info: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: "" };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[TRADR] Uncaught error:", error, info.componentStack);
    this.setState({ info: info.componentStack ?? "" });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: BODY,
        padding: "24px",
        boxSizing: "border-box",
      }}>
        <div style={{ maxWidth: "480px", width: "100%" }}>

          {/* Wordmark */}
          <div style={{
            fontFamily: DISPLAY,
            fontSize: "17px",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: C.text,
            marginBottom: "48px",
          }}>
            TRADR<span style={{ color: C.blue }}>.</span>
          </div>

          {/* Error kicker */}
          <div style={{
            fontFamily: MONO,
            fontSize: "11px",
            color: C.red,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "16px",
          }}>
            — Something went wrong
          </div>

          <p style={{
            fontSize: "15px",
            color: C.text2,
            lineHeight: 1.65,
            marginBottom: "28px",
            maxWidth: "40ch",
          }}>
            An unexpected error occurred. Your trades are safe — reload the page to continue.
          </p>

          {/* Error details (collapsed by default) */}
          <details style={{ marginBottom: "36px" }}>
            <summary style={{
              cursor: "pointer",
              fontFamily: MONO,
              fontSize: "11px",
              color: C.muted,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              userSelect: "none",
            }}>
              Error details
            </summary>
            <pre style={{
              marginTop: "12px",
              padding: "12px",
              border: `1px solid ${C.border2}`,
              borderRadius: "6px",
              fontFamily: MONO,
              fontSize: "11px",
              color: C.muted,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: 1.6,
            }}>
              {this.state.error.message}
              {this.state.info && `\n\nComponent stack:${this.state.info}`}
            </pre>
          </details>

          {/* Reload CTA */}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: C.text,
              color: C.bg,
              border: "none",
              borderRadius: "999px",
              padding: "14px 28px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: BODY,
              letterSpacing: "0.01em",
            }}
          >
            Reload app →
          </button>
        </div>
      </div>
    );
  }
}
