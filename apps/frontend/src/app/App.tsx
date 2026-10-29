import {
  Activity,
  ArrowUpRight,
  Eye,
  LayoutDashboard,
  Mountain,
  Sun,
  BrainCircuit,
} from "lucide-react";
import { NavLink, Route, Routes, Link } from "react-router-dom";
import { Dashboard } from "../pages/Dashboard";
import { SystemPage } from "../pages/SystemPage";
import { ObservationPage } from "../pages/ObservationPage";
import { PlanningPage } from "../pages/PlanningPage";
import { ExecutionPage, ExecutionBoundary } from "../pages/ExecutionPage";
import { VerificationPage } from "../pages/VerificationPage";
import { RecoveryPage } from "../pages/RecoveryPage";
import { FeatureBoundary } from "../components/FeatureBoundary";

export function App() {
  return (
    <div className="app-shell">
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
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            <LayoutDashboard size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/observations">
            <Eye size={18} />
            Observations
          </NavLink>
          <NavLink to="/system">
            <Activity size={18} />
            System status
          </NavLink>
          <NavLink to="/planning">
            <BrainCircuit size={18} />
            AI Planning
          </NavLink>
          <NavLink to="/execution">
            <Activity size={18} />
            Live Execution
          </NavLink>
          <NavLink to="/verification">
            <Eye size={18} />
            Verification Center
          </NavLink>
          <NavLink to="/recovery">
            <Activity size={18} />
            Recovery Center
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="phase-card">
            <span className="phase-badge">PHASE 05</span>
            <h3>Independent outcome verification</h3>
            <p>
              The first step toward
              <br />
              self-healing visual autonomy.
            </p>
            <div className="mountain-lines">
              <Mountain size={62} strokeWidth={0.7} />
            </div>
          </div>
          <div className="origin">
            <span className="flag">▰ ▰ ▰</span> BUILT IN ECUADOR <span>↗</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            INTI AI <span className="divider">/</span> Developer workspace
          </span>
          <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">
            API docs <ArrowUpRight size={14} />
          </a>
          <span className="environment">LOCAL ENVIRONMENT</span>
        </header>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
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
                <ExecutionBoundary>
                  <ExecutionPage />
                </ExecutionBoundary>
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
                  <Link to="/">Return to dashboard</Link>
                </>
              }
            />
          </Routes>
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
