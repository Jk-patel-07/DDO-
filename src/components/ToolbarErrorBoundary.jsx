import { Component } from 'react';

class ToolbarErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Toolbar Error]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          color: '#ff6666',
          padding: '8px',
          fontSize: '11px',
          textAlign: 'center',
          background: 'rgba(0,0,0,0.8)',
          height: '42px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100vw'
        }}>
          Toolbar error: {this.state.error?.message || 'Unknown error'}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ToolbarErrorBoundary;
