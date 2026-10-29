import { Component, type ReactNode } from "react";
export class FeatureBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div role="alert">
        This workspace could not render. Reload to reconnect with saved records.
      </div>
    ) : (
      this.props.children
    );
  }
}
