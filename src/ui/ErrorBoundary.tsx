import React from 'react';

interface State {
  error: Error | null;
}

/**
 * ErrorBoundary shows a rendering error on screen instead of leaving an empty
 * view, which matters on mobile where the console is not available.
 */
export class ErrorBoundary extends React.Component<{ context: string }, State> {
  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public state: State = { error: null };

  public componentDidCatch(error: Error): void {
    console.error(`ledger: ${this.props.context} crashed`, error);
  }

  public render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <div className="ledger-error-panel">
        <h3>The Ledger {this.props.context} ran into a problem</h3>
        <p>
          Please report this message. Your ledger file has not been changed.
        </p>
        <pre>{`${error.name}: ${error.message}\n${error.stack ?? ''}`}</pre>
        <button onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
