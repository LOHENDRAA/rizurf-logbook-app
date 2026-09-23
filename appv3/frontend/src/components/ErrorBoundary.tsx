import { Component, type ReactNode } from 'react'

/** Route-level error boundary: generic message + request id, no internals. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: undefined as unknown }

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error }
  }

  componentDidCatch(): void {
    // Intentionally not logged with payload: surfaces stay generic.
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="simple-sheet" role="alert">
          <h1>Something went wrong</h1>
          <p className="empty-copy">Please refresh and try again. If this keeps happening, contact support.</p>
          <button
            className="button primary"
            type="button"
            onClick={() => {
              this.setState({ error: undefined })
              window.location.reload()
            }}
          >
            Refresh
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
