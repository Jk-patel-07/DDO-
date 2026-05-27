import { Component } from 'react';

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('DDO runtime error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-runtime-fallback">
          <div className="app-runtime-fallback-card">
            <h1>DDO</h1>
            <p>Something went wrong while loading the app.</p>
            <button
              type="button"
              className="app-runtime-fallback-button"
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
