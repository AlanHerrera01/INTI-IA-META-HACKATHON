import { Component, type ReactNode } from "react";
import { useLocale } from "../i18n/useLocale";
export function WorkspaceError() {
  const { t } = useLocale();
  return (
    <div role="alert">
      {t(
        "This workspace could not render. Reload to reconnect with saved records.",
      )}
    </div>
  );
}
export class FeatureBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <WorkspaceError /> : this.props.children;
  }
}
