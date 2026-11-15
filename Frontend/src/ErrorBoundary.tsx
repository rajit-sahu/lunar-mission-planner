import { Component, type ReactNode } from "react";

/** Last-resort fallback so a WebGL or chunk-load failure never leaves a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fallback" role="alert">
        <h1>Lunar South Pole Mission Planner</h1>
        <p>Something went wrong showing the 3D Moon. Your browser may not support WebGL, or the page was updated while open.</p>
        <p>
          <button className="btn" onClick={() => location.reload()}>
            Reload
          </button>
        </p>
        <p className="small">
          The short version: at the Moon's south pole the Sun skims the horizon, so a few metres of terrain decide whether a lander gets
          sunlight and a radio line to Earth, and a one-week launch slip can change which site is best.
        </p>
      </div>
    );
  }
}
