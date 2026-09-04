import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render-time errors so one broken component cannot unmount the whole
 * React tree and leave a white page.
 *
 * The fallback is deliberately plain markup. It imports no app UI components,
 * because a boundary that depends on the code it guards is a boundary that can
 * fail alongside it.
 *
 * Scope it as tightly as the navigation allows. A boundary around a single admin
 * section keeps the sidebar mounted, so the user can always leave a broken page.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Names the part of the UI this boundary guards, e.g. "Campaigns".
   * Used in the fallback heading so the user knows what broke.
   */
  label?: string;
  /** One line telling the user what to do next. */
  hint?: string;
  /** Fills the viewport. Use for the top-level boundary, not for section boundaries. */
  fullScreen?: boolean;
  /** Runs after a successful reset, e.g. to refetch data. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the real stack in the console even when the UI hides it in production.
    console.error(
      `[ErrorBoundary] ${this.props.label ?? "app"} crashed:`,
      error,
      info.componentStack,
    );
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { label, hint, fullScreen } = this.props;
    const heading = label ? `${label} stopped working.` : "Something stopped working.";
    const message = error.message || "No error message was reported.";
    const isDev = import.meta.env.DEV;

    const panel = (
      <div
        role="alert"
        className="w-full max-w-2xl rounded-lg border border-destructive/40 bg-card p-6 text-left"
      >
        <h2 className="text-base font-semibold text-foreground">{heading}</h2>

        <p className="mt-2 break-words text-sm text-destructive">{message}</p>

        <p className="mt-2 text-sm text-muted-foreground">
          {hint ?? "Try again, or reload the page."}
        </p>

        {isDev && error.stack && (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-relaxed text-muted-foreground">
            {error.stack}
          </pre>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
          >
            Reload page
          </button>
        </div>
      </div>
    );

    if (fullScreen) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          {panel}
        </div>
      );
    }

    return <div className="py-6">{panel}</div>;
  }
}

export default ErrorBoundary;
