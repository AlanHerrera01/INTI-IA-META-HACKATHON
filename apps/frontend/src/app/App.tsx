import { useLocale } from "../i18n/useLocale";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Plus,
  Rocket,
  UserRound,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Route, Routes, Link, useLocation } from "react-router-dom";
import { Overview } from "../pages/Overview";
import { MissionControl } from "../pages/MissionControl";
import { OperatorProvider } from "./OperatorContext";
import { useOperator } from "../hooks/useOperator";
import { useSystem, useModel } from "../hooks/useSystem";
import { missionApi } from "../services/missionApi";
import { navigation, computerNavigation, workspaceLabel } from "./navigation";
import { api } from "../services/api";
import { WorkspaceSearch } from "../components/WorkspaceSearch";
import { MissionTrail } from "../components/MissionTrail";
import { FeatureBoundary } from "../components/FeatureBoundary";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { LanguageSelector } from "../i18n/LanguageSelector";
import { NativeDesignedPage } from "../pages/NativeDesignedPage";

const InventoryPage = lazy(() =>
  import("../pages/InventoryPage").then((module) => ({
    default: module.InventoryPage,
  })),
);
const ComputerPage = lazy(() =>
  import("../pages/ComputerPage").then((module) => ({
    default: module.ComputerPage,
  })),
);

const Dashboard = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const SystemPage = lazy(() =>
  import("../pages/SystemPage").then((m) => ({ default: m.SystemPage })),
);
const ModelsPage = lazy(() =>
  import("../pages/ModelsPage").then((m) => ({ default: m.ModelsPage })),
);
const ObservationPage = lazy(() =>
  import("../pages/ObservationPage").then((m) => ({
    default: m.ObservationPage,
  })),
);
const PlanningPage = lazy(() =>
  import("../pages/PlanningPage").then((m) => ({ default: m.PlanningPage })),
);
const ExecutionPage = lazy(() =>
  import("../pages/ExecutionPage").then((m) => ({ default: m.ExecutionPage })),
);
const VerificationPage = lazy(() =>
  import("../pages/VerificationPage").then((m) => ({
    default: m.VerificationPage,
  })),
);
const RecoveryPage = lazy(() =>
  import("../pages/RecoveryPage").then((m) => ({ default: m.RecoveryPage })),
);
const BenchmarkPage = lazy(() =>
  import("../pages/BenchmarkPage").then((m) => ({ default: m.BenchmarkPage })),
);

const ActivityPage = lazy(() =>
  import("../pages/ActivityPage").then((m) => ({ default: m.ActivityPage })),
);
const TaskManager = lazy(() =>
  import("../pages/TaskManager").then((m) => ({ default: m.TaskManager })),
);

export function App() {
  return (
    <LocaleProvider>
      <OperatorProvider>
        <ApplicationShell />
      </OperatorProvider>
    </LocaleProvider>
  );
}

function ApplicationShell() {
  const { t } = useLocale();
  const system = useSystem();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const model = useModel();
  const { token, notice, notify } = useOperator();
  const capabilities = useQuery({
    queryKey: ["capabilities"],
    queryFn: api.capabilities,
    staleTime: 30000,
    retry: false,
  });
  const localComputer = capabilities.data?.runtime_mode === "local_computer";
  const visibleNavigation = localComputer
    ? [...navigation, ...computerNavigation]
    : navigation;
  const missions = useQuery({
    queryKey: ["mission-control", token],
    queryFn: () => missionApi.overview(token),
    enabled: !!token && capabilities.isSuccess && !localComputer,
    refetchInterval: 5000,
  });
  const backendState = system.error
    ? "unavailable"
    : system.data?.backend
      ? "online"
      : "checking";
  const active = missions.data?.active_executions ?? 0;
  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        {t("Skip to main content")}
      </a>
      <aside className="sidebar">
        <div className="sidebar-identity">
          <Link className="brand" to="/" aria-label={t("INTI AI Overview")}>
            <div className="brand-mark">
              <img
                src="/brand/inti-ai-logo-v1.png"
                width="32"
                height="32"
                alt=""
              />
            </div>
            <div>
              INTI AI<span>{t("AUTONOMOUS INTELLIGENCE")}</span>
            </div>
          </Link>
          <div className="brand-meta">
            <span>ECUADOR · META 2026</span>
            <span>
              <i className={`health-dot ${backendState}`} aria-hidden="true" />v
              {system.data?.version ?? "0.7.0"}
            </span>
          </div>
        </div>
        <nav aria-label={t("Main navigation")} className="sidebar-navigation">
          {[...new Set(visibleNavigation.map((item) => item.group))].map(
            (group) => (
              <div className="nav-group" key={group}>
                <p className="nav-label">{t(group)}</p>
                {visibleNavigation
                  .filter((item) => item.group === group)
                  .map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      title={t(label)}
                      aria-label={t(label)}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={18} aria-hidden="true" />
                          <span className="nav-text">{t(label)}</span>
                          {to === "/tasks" && isActive && (
                            <span className="nav-badge">{t("Active")}</span>
                          )}
                          {to === "/execution" && active > 0 && (
                            <span
                              className="health-dot online nav-indicator"
                              title={`${active} active executions`}
                            />
                          )}
                          {to === "/recovery" &&
                            missions.data?.features.recovery_enabled && (
                              <span className="nav-badge nav-badge-gold">
                                {t("Bounded")}
                              </span>
                            )}
                          {to === "/verification" &&
                            missions.data?.latest_verdict ===
                              "VERIFIED_SUCCESS" && (
                              <span
                                className="nav-badge nav-badge-green"
                                title={t("Latest independent verdict")}
                              >
                                {t("Verified")}
                              </span>
                            )}
                        </>
                      )}
                    </NavLink>
                  ))}
              </div>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-runtime">
            <div>
              <span
                className={`health-dot ${backendState}`}
                aria-hidden="true"
              />
              <span className="nav-text">
                BACKEND {t(backendState.toUpperCase())}
              </span>
              <span className="runtime-ready">
                {t(
                  system.data
                    ? system.data.ready
                      ? "READY"
                      : "DEGRADED"
                    : "CHECKING",
                )}
              </span>
            </div>
            <small className="nav-text">
              {localComputer
                ? t("PAIRED WINDOWS AGENT")
                : t("LOCAL CHROMIUM SANDBOX")}
            </small>
          </div>
          <div className="operator-profile">
            <Link to="/?connect=1" title={t("Manage operator connection")}>
              <span className="operator-avatar">
                <UserRound size={20} aria-hidden="true" />
              </span>
              <span className="nav-text">
                {t("Local operator")}
                <small>
                  {token ? t("Capability connected") : t("Not connected")}
                </small>
              </span>
            </Link>
            <button
              className="sidebar-toggle"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={
                collapsed ? t("Expand navigation") : t("Collapse navigation")
              }
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ChevronRight size={16} />
              ) : (
                <ChevronLeft size={16} />
              )}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="shell-breadcrumb">
            <span className="breadcrumb-brand">INTI AI</span>
            <span className="divider">/</span>
            <span className="breadcrumb-platform">{t("Command Platform")}</span>
            {pathname !== "/" && (
              <>
                <span className="divider">/</span>
                <span className="breadcrumb-current">
                  {t(
                    localComputer
                      ? visibleNavigation.find((item) => item.to === pathname)
                          ?.label || workspaceLabel(pathname)
                      : workspaceLabel(pathname),
                  )}
                </span>
              </>
            )}
          </span>
          <WorkspaceSearch items={visibleNavigation} />
          <LanguageSelector />
          <span
            className="shell-health model-connection"
            title={model.data?.model ?? t("Meta model availability")}
          >
            <span
              className={`health-dot ${model.data?.available === true ? "online" : model.data?.configured ? "checking" : "unavailable"}`}
              aria-hidden="true"
            />
            <span>
              Meta{" "}
              <span className="model-availability">
                {model.data?.available === true
                  ? t("Connected")
                  : model.data?.configured
                    ? t("Unverified")
                    : t("Not configured")}
              </span>
            </span>
          </span>
          <Link
            className="button solar-button topbar-new-task"
            to="/missions/new?compose=1"
          >
            <Plus size={16} aria-hidden="true" />
            {t("New Task")}
          </Link>
          <details className="shell-notifications">
            <summary aria-label={t("Notifications")}>
              <Bell size={19} aria-hidden="true" />
              {notice && <i className="notification-indicator" />}
            </summary>
            <div className="notification-popover">
              <h2>{t("Session notifications")}</h2>
              <p>
                {notice ? t(notice) : t("No notifications for this session.")}
              </p>
              {notice && (
                <button className="button secondary" onClick={() => notify("")}>
                  {t("Dismiss")}
                </button>
              )}
            </div>
          </details>
          <Link
            className="frontier-link"
            to="/missions/new?guided=1"
            title={t("Open the guided demo")}
          >
            <Rocket size={15} aria-hidden="true" />
            <span>Push the Frontier</span>
          </Link>
          <Link
            className="topbar-profile"
            to="/?connect=1"
            aria-label={t("Manage operator connection")}
          >
            <UserRound size={20} />
          </Link>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div className="global-notification" aria-live="polite">
            {notice && (
              <>
                <span>{t(notice)}</span>
                <button
                  onClick={() => notify("")}
                  aria-label={t("Dismiss notification")}
                >
                  ×
                </button>
              </>
            )}
          </div>
          {!localComputer && <MissionTrail />}
          <Suspense fallback={<p role="status">{t("Loading workspace…")}</p>}>
            {capabilities.isPending ? (
              <p role="status">{t("Loading workspace configuration…")}</p>
            ) : capabilities.isError ? (
              <p role="alert">
                {t(
                  "Workspace configuration unavailable. Reload after checking the backend.",
                )}
              </p>
            ) : (
              <Routes>
                <Route path="/computer" element={<ComputerPage />} />
                <Route
                  path="/computer/tasks"
                  element={<ComputerPage view="history" />}
                />
                <Route
                  path="/computer/permissions"
                  element={<ComputerPage view="settings" />}
                />

                <Route
                  path="/"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="overview" />
                      ) : (
                        <Overview />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/missions/new"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="mission" />
                      ) : (
                        <MissionControl />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/missions/:id"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="mission" />
                      ) : (
                        <MissionControl />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/benchmarks"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="analytics" />
                      ) : (
                        <BenchmarkPage />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/tasks"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="tasks" />
                      ) : (
                        <TaskManager />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/dashboard"
                  element={
                    localComputer ? (
                      <NativeDesignedPage view="overview" />
                    ) : (
                      <Dashboard />
                    )
                  }
                />
                <Route
                  path="/inventory"
                  element={
                    localComputer ? (
                      <NativeDesignedPage view="hardware" />
                    ) : (
                      <InventoryPage />
                    )
                  }
                />
                <Route
                  path="/observations"
                  element={
                    localComputer ? (
                      <NativeDesignedPage view="observations" />
                    ) : (
                      <ObservationPage />
                    )
                  }
                />
                <Route
                  path="/observations/:id"
                  element={
                    localComputer ? (
                      <NativeDesignedPage view="observations" />
                    ) : (
                      <ObservationPage />
                    )
                  }
                />
                <Route
                  path="/system"
                  element={
                    localComputer ? (
                      <NativeDesignedPage view="settings" />
                    ) : (
                      <SystemPage />
                    )
                  }
                />
                <Route
                  path="/models"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="models" />
                      ) : (
                        <ModelsPage />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/activity"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="activity" />
                      ) : (
                        <ActivityPage />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/planning"
                  element={
                    localComputer ? (
                      <NativeDesignedPage view="planning" />
                    ) : (
                      <PlanningPage />
                    )
                  }
                />
                <Route
                  path="/execution"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="execution" />
                      ) : (
                        <ExecutionPage />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/verification"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="verification" />
                      ) : (
                        <VerificationPage />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="/recovery"
                  element={
                    <FeatureBoundary>
                      {localComputer ? (
                        <NativeDesignedPage view="recovery" />
                      ) : (
                        <RecoveryPage />
                      )}
                    </FeatureBoundary>
                  }
                />
                <Route
                  path="*"
                  element={
                    <>
                      <h1>{t("Page not found")}</h1>
                      <Link to="/">{t("Return to Mission Control")}</Link>
                    </>
                  }
                />
              </Routes>
            )}
          </Suspense>
        </main>
        <footer>
          <span>
            INTI AI{" "}
            <span className="subtle">{t("/ See. Reason. Act. Verify.")}</span>
          </span>
          <span>
            Meta Global AI Developer Hackathon 2026{" "}
            <span className="gold-dot">·</span> Push the Frontier
          </span>
        </footer>
      </div>
    </div>
  );
}
