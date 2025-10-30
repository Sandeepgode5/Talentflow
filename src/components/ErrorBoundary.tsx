// src/components/ErrorBoundary.tsx
import React from "react";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error; info?: React.ErrorInfo };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // You could also log to a service here
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error("💥 Uncaught error:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: undefined, info: undefined });
    // Hard refresh to reset app state if needed
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-xl w-full rounded-2xl bg-white shadow p-6">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-600">
            An unexpected error occurred. You can reload the page to try again.
          </p>

          {this.state.error && (
            <pre className="mt-4 max-h-40 overflow-auto rounded bg-gray-100 p-3 text-xs text-red-700">
              {this.state.error?.name}: {this.state.error?.message}
              {this.state.info?.componentStack}
            </pre>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={this.handleReload}
              className="rounded-lg bg-black text-white px-3 py-2 text-sm"
            >
              Reload
            </button>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="rounded-lg border px-3 py-2 text-sm"
              title="Try to continue without reloading"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
}
