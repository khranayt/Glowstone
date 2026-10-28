import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../lib/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Glowstone crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen">
        <div className="crash-card">
          <h1 className="crash-title">{t("Glowstone hit a snag")}</h1>
          <p className="crash-copy">
            {t("The last action could not be completed. Your notes on disk are untouched.")}
          </p>
          <pre className="crash-detail">{this.state.error.message}</pre>
          <div className="crash-actions">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              {t("Reload Glowstone")}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => this.setState({ error: null })}
            >
              {t("Try again")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
