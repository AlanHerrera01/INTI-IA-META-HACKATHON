import {
  NativeWorkspaceContext,
  useNativeData,
} from "../hooks/useNativeWorkspace";
import { useOperator } from "../hooks/useOperator";
import { useLocation } from "react-router-dom";
import {
  NativeOverview,
  NativeStudio,
  NativeExecution,
  NativeTasks,
  NativeMission,
} from "./native/NativeCorePages";
import {
  NativeModels,
  NativeSettings,
  NativeAnalytics,
  NativeActivity,
} from "./native/NativeSystemPages";
import {
  NativeObservations,
  NativeVerification,
  NativeRecovery,
  NativeHardware,
} from "./native/NativeEvidencePages";
import "../styles/overview.css";
import "../styles/studio.css";
import "../styles/mission.css";
import "../styles/execution.css";
import "../styles/live-execution.css";
import "../styles/task-manager.css";
import "../styles/observations.css";
import "../styles/verification-lab.css";
import "../styles/recovery-center.css";
import "../styles/inventory.css";
import "../styles/models.css";
import "../styles/settings.css";
import "../styles/analytics.css";
import "../styles/activity.css";
import "../styles/native-design.css";

export type NativeView =
  | "overview"
  | "planning"
  | "execution"
  | "tasks"
  | "observations"
  | "hardware"
  | "recovery"
  | "verification"
  | "analytics"
  | "activity"
  | "models"
  | "settings";
type NativeDesignView = NativeView | "mission";
export function NativeDesignedPage({ view }: { view: NativeDesignView }) {
  const { token } = useOperator();
  const { pathname, search } = useLocation();
  return (
    <NativeDesignBoundary
      key={`${view}:${token}:${pathname}:${search}`}
      view={view}
    />
  );
}
function NativeDesignBoundary({ view }: { view: NativeDesignView }) {
  const state = useNativeData();
  let page;
  switch (view) {
    case "mission":
      page = <NativeMission />;
      break;
    case "overview":
      page = <NativeOverview />;
      break;
    case "planning":
      page = <NativeStudio />;
      break;
    case "execution":
      page = <NativeExecution />;
      break;
    case "tasks":
      page = <NativeTasks />;
      break;
    case "observations":
      page = <NativeObservations />;
      break;
    case "verification":
      page = <NativeVerification />;
      break;
    case "recovery":
      page = <NativeRecovery />;
      break;
    case "hardware":
      page = <NativeHardware />;
      break;
    case "settings":
      page = <NativeSettings />;
      break;
    case "models":
      page = <NativeModels />;
      break;
    case "analytics":
      page = <NativeAnalytics />;
      break;
    case "activity":
      page = <NativeActivity />;
      break;
  }
  return (
    <NativeWorkspaceContext.Provider value={state}>
      {page}
    </NativeWorkspaceContext.Provider>
  );
}
