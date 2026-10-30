import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Eye,
  FlaskConical,
  LayoutDashboard,
  Mountain,
  PlayCircle,
  ShieldCheck,
  Sun,
  Wrench,
} from "lucide-react";
import { lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Route, Routes, Link } from "react-router-dom";
import { MissionControl } from "../pages/MissionControl";
import { OperatorProvider } from "./OperatorContext";
import { useOperator } from "../hooks/useOperator";
import { useSystem, useModel } from "../hooks/useSystem";
import { missionApi } from "../services/missionApi";
import { MissionTrail } from "../components/MissionTrail";
import { FeatureBoundary } from "../components/FeatureBoundary";

const Dashboard = lazy(() =>
  import("../pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const SystemPage = lazy(() =>
  import("../pages/SystemPage").then((m) => ({ default: m.SystemPage })),
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

const navigation = [
  { to: "/", label: "Mission Control", icon: LayoutDashboard, end: true },
  { to: "/planning", label: "AI Planning", icon: BrainCircuit },
  { to: "/execution", label: "Live Execution", icon: PlayCircle },
  { to: "/recovery", label: "Recovery Center", icon: Wrench },
  { to: "/verification", label: "Verification Center", icon: ShieldCheck },
  { to: "/benchmarks", label: "Benchmark Lab", icon: FlaskConical },
  { to: "/observations", label: "Observations", icon: Eye },
  { to: "/system", label: "System Status", icon: Activity },
];

export function App() {
  return (
    <OperatorProvider>
      <ApplicationShell />
    </OperatorProvider>
  );
}

function ApplicationShell() {
  const system = useSystem();
  const model = useModel();
  const { token, notice, notify } = useOperator();
  const missions = useQuery({
    queryKey: ["mission-control", token],
    queryFn: () => missionApi.overview(token),
    enabled: !!token,
    refetchInterval: 5000,
  });
  const backendState = system.error
    ? "unavailable"
    : system.data?.backend
      ? "online"
      : "checking";
  const active = missions.data?.active_executions ?? 0;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <div className="brand-mark">
            <Sun size={30} />
          </div>
          <div>
            INTI <strong>AI</strong>
            <span>VISUAL INTELLIGENCE</span>
          </div>
        </Link>
        <div className="nav-label">MISSION WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="phase-card">
            <span className="phase-badge">LOCAL RELEASE · 0.7</span>
            <h3>Evidence before conclusions</h3>
            <p>
              Bounded recovery. Independent verification. Inspect every step.
            </p>
            <div className="mountain-lines">
              <Mountain size={62} strokeWidth={0.7} aria-hidden="true" />
            </div>
          </div>
          <div className="origin">
            <span className="flag" aria-hidden="true">
              ▰ ▰ ▰
            </span>{" "}
            BUILT IN ECUADOR <span aria-hidden="true">↗</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            INTI AI <span className="divider">/</span> Mission workspace
          </span>
          <Link className="topbar-demo" to="/?guided=1">
            Guided demo
          </Link>
          <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">
            API docs <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <span className="shell-health" title="Backend health">
            <span className={`health-dot ${backendState}`} aria-hidden="true" />
            Backend · {backendState}
          </span>
          <span className="shell-health" title="Meta model availability">
            <span
              className={`health-dot ${
                model.data?.available === true
                  ? "online"
                  : model.data?.configured
                    ? "checking"
                    : "unavailable"
              }`}
              aria-hidden="true"
            />
            Meta ·{" "}
            {model.data?.available === true
              ? "available"
              : model.data?.configured
                ? "unverified"
                : "not configured"}
          </span>
          <span
            className={`shell-health ${active ? "shell-active" : ""}`}
            title="Active executions"
          >
            <span
              className={`health-dot ${active ? "online" : "idle"}`}
              aria-hidden="true"
            />
            Active · {missions.data ? active : "—"}
          </span>
          <span className="shell-version">
            v{system.data?.version ?? "0.7.0"}
          </span>
        </header>
        <main className="main-content" id="main-content" tabIndex={-1}>
          <div className="global-notification" aria-live="polite">
            {notice && (
              <>
                <span>{notice}</span>
                <button
                  onClick={() => notify("")}
                  aria-label="Dismiss notification"
                >
                  ×
                </button>
              </>
            )}
          </div>
          <MissionTrail />
          <Suspense fallback={<p role="status">Loading workspace…</p>}>
            <Routes>
              <Route
                path="/"
                element={
                  <FeatureBoundary>
                    <MissionControl />
                  </FeatureBoundary>
                }
              />
              <Route
                path="/missions/:id"
                element={
                  <FeatureBoundary>
                    <MissionControl />
                  </FeatureBoundary>
                }
              />
              <Route
                path="/benchmarks"
                element={
                  <FeatureBoundary>
                    <BenchmarkPage />
                  </FeatureBoundary>
                }
              />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route
                path="/observations"
                element={<Dashboard observationsPage />}
              />
              <Route path="/observations/:id" element={<ObservationPage />} />
              <Route path="/system" element={<SystemPage />} />
              <Route path="/planning" element={<PlanningPage />} />
              <Route
                path="/execution"
                element={
                  <FeatureBoundary>
                    <ExecutionPage />
                  </FeatureBoundary>
                }
              />
              <Route
                path="/verification"
                element={
                  <FeatureBoundary>
                    <VerificationPage />
                  </FeatureBoundary>
                }
              />
              <Route
                path="/recovery"
                element={
                  <FeatureBoundary>
                    <RecoveryPage />
                  </FeatureBoundary>
                }
              />
              <Route
                path="*"
                element={
                  <>
                    <h1>Page not found</h1>
                    <Link to="/">Return to Mission Control</Link>
                  </>
                }
              />
            </Routes>
          </Suspense>
        </main>
        <footer>
          <span>
            INTI AI <span className="subtle">/ See. Reason. Act. Verify.</span>
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
