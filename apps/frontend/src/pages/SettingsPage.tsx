import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  BrainCircuit,
  CircleUserRound,
  Download,
  Gauge,
  KeyRound,
  Layers3,
  Monitor,
  RefreshCw,
  ScanLine,
  Server,
  Settings2,
  ShieldCheck,
  Unplug,
  Wrench,
} from "lucide-react";
import { useModel, useSystem } from "../hooks/useSystem";
import { useOperator } from "../hooks/useOperator";
import { api, errorMessage } from "../services/api";
import { inventoryApi } from "../services/inventoryApi";
import { downloadTaskJson } from "../features/tasks/records";
import "../styles/settings.css";

const stateText = (
  value: boolean | undefined,
  yes = "Enabled",
  no = "Disabled",
) => (value === undefined ? "Unknown" : value ? yes : no);
const modules = [
  { id: "all", label: "All Modules", icon: Layers3 },
  { id: "general", label: "General & Access", icon: CircleUserRound },
  { id: "vision", label: "Vision & AI Models", icon: BrainCircuit },
  { id: "apps", label: "Connected Apps", icon: Boxes },
  { id: "sandbox", label: "Sandbox & Services", icon: ShieldCheck },
];

export function SettingsPage() {
  const [module, setModule] = useState("all");
  const [draft, setDraft] = useState("");
  const { token, setToken } = useOperator();
  const modelQuery = useModel();
  const systemQuery = useSystem();
  const capabilityQuery = useQuery({
    queryKey: ["capabilities"],
    queryFn: api.capabilities,
    refetchInterval: 30000,
    retry: false,
  });
  const inventoryQuery = useQuery({
    queryKey: ["hardware-inventory"],
    queryFn: inventoryApi.list,
    refetchInterval: 30000,
    retry: false,
  });
  const model = !modelQuery.isError ? modelQuery.data : undefined;
  const system = !systemQuery.isError ? systemQuery.data : undefined;
  const capabilities = !capabilityQuery.isError
    ? capabilityQuery.data
    : undefined;
  const assets = !inventoryQuery.isError ? inventoryQuery.data : undefined;
  const complete = !!(model && system && capabilities && assets);
  const refreshing =
    modelQuery.isFetching ||
    systemQuery.isFetching ||
    capabilityQuery.isFetching ||
    inventoryQuery.isFetching;
  const show = (id: string) => module === "all" || module === id;
  const configured = stateText(
    model?.configured,
    "Configured",
    "Not configured",
  );
  const lastAnalysis = !model
    ? "Unknown"
    : model.available == null
      ? "Not established"
      : model.available
        ? "Last analysis succeeded"
        : "Last analysis failed";
  const refresh = () => {
    void modelQuery.refetch();
    void systemQuery.refetch();
    void capabilityQuery.refetch();
    void inventoryQuery.refetch();
  };
  const errors = [
    modelQuery.error,
    systemQuery.error,
    capabilityQuery.error,
    inventoryQuery.error,
  ].filter(Boolean);
  const exportDiagnostics = () => {
    if (!model || !system || !capabilities || !assets || refreshing) return;
    // Explicit public fields only: operator capability and draft never enter exports.
    downloadTaskJson("inti-settings-diagnostics.json", {
      downloaded_at: new Date().toISOString(),
      model: {
        provider: model.provider,
        model: model.model,
        configured: model.configured,
        available: model.available,
      },
      system: {
        backend: system.backend,
        database: system.database,
        browser: system.browser,
        ready: system.ready,
        version: system.version,
      },
      capabilities: {
        model_calls_enabled: capabilities.model_calls_enabled,
        execution_enabled: capabilities.execution_enabled,
        verification_enabled: capabilities.verification_enabled,
        recovery_enabled: capabilities.recovery_enabled,
      },
      inventory: { reachable: true, record_count: assets.length },
      source_read_times: {
        model: new Date(modelQuery.dataUpdatedAt).toISOString(),
        system: new Date(systemQuery.dataUpdatedAt).toISOString(),
        capabilities: new Date(capabilityQuery.dataUpdatedAt).toISOString(),
        inventory: new Date(inventoryQuery.dataUpdatedAt).toISOString(),
      },
    });
  };
  const permissionRows = [
    {
      name: "Task model requests",
      description: "Model-based tasks also require a configured Meta adapter.",
      enabled: capabilities?.model_calls_enabled,
      icon: BrainCircuit,
    },
    {
      name: "Browser execution service",
      description:
        "Execution requires an approved manifest and operator capability.",
      enabled: capabilities?.execution_enabled,
      icon: Monitor,
    },
    {
      name: "Independent verification service",
      description:
        "Verifies approved criteria with read-only application evidence.",
      enabled: capabilities?.verification_enabled,
      icon: ShieldCheck,
    },
    {
      name: "Recovery service",
      description:
        "Model diagnosis also requires model requests to be enabled.",
      enabled: capabilities?.recovery_enabled,
      icon: Wrench,
    },
  ];
  return (
    <div className="settings-workspace">
      <header className="settings-heading">
        <div className="settings-heading-icon">
          <Settings2 size={23} />
        </div>
        <div>
          <p className="settings-eyebrow">SYSTEM / LOCAL WORKSPACE</p>
          <h1>System Settings & Platform Configuration</h1>
          <p>
            Review model access, connected applications and sandbox services.
          </p>
        </div>
        <div className="settings-heading-actions">
          <button
            onClick={exportDiagnostics}
            disabled={!complete || refreshing}
          >
            <Download size={14} /> Export diagnostics
          </button>
          <button
            className="settings-primary"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw size={14} /> Refresh diagnostics
          </button>
        </div>
      </header>
      <nav className="settings-module-nav" aria-label="Settings sections">
        {modules.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={module === id}
            onClick={() => setModule(id)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>
      {errors.length > 0 && (
        <div role="alert" className="settings-error">
          {[...new Set(errors.map(errorMessage))].map((message) => (
            <p key={message}>{message}</p>
          ))}
          <small>
            Failed sources show Unknown or Unavailable. Export requires complete
            diagnostics.
          </small>
        </div>
      )}
      {(show("general") || show("vision") || show("apps")) && (
        <div
          className={`settings-body ${module === "all" ? "" : "settings-filtered"}`}
        >
          {show("general") && (
            <aside
              className="settings-aside"
              aria-label="General and operator access"
            >
              <section
                className="settings-card settings-profile"
                aria-label="Local operator access"
              >
                <header>
                  <CircleUserRound size={18} />
                  <h2>Local Operator & Access</h2>
                  <span className="settings-tag">MEMORY ONLY</span>
                </header>
                <div className="settings-identity">
                  <div>
                    <CircleUserRound size={38} />
                  </div>
                  <section>
                    <h3>Local workspace operator</h3>
                    <p>
                      Access to protected task evidence and execution controls.
                    </p>
                    <span className="settings-tag settings-neutral">
                      {token ? "CAPABILITY LOADED" : "NOT CONNECTED"}
                    </span>
                  </section>
                </div>
                <p className="settings-note">
                  Protected requests validate this capability on the server.
                  Loading it does not verify a personal identity.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.trim()) {
                      setToken(draft.trim());
                      setDraft("");
                    }
                  }}
                >
                  <label>
                    Operator capability
                    <input
                      type="password"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      autoComplete="off"
                      placeholder="Local operator token"
                    />
                  </label>
                  <div className="settings-access-actions">
                    <button disabled={!draft.trim()}>
                      <KeyRound size={13} /> Load capability
                    </button>
                    <button
                      type="button"
                      disabled={!token}
                      onClick={() => {
                        setToken("");
                        setDraft("");
                      }}
                    >
                      <Unplug size={13} /> Disconnect
                    </button>
                  </div>
                </form>
                <small>Access stays in memory and clears on page reload.</small>
                <Link className="settings-profile-assets" to="/inventory">
                  <Boxes size={17} />
                  <span>
                    Hardware & IT Inventory
                    <small>Inspect connected assets</small>
                  </span>
                  <ArrowUpRight size={15} />
                </Link>
              </section>
              <section
                className="settings-card settings-calibration"
                aria-label="Vision calibration"
              >
                <header>
                  <Gauge size={18} />
                  <h2>Vision Calibration</h2>
                  <span className="settings-tag settings-neutral">
                    EVALUATION
                  </span>
                </header>
                <strong>Not measured</strong>
                <p>
                  Grounding precision requires a recorded comparative
                  evaluation.
                </p>
                <Link to="/benchmarks">
                  View benchmark evidence <ArrowUpRight size={13} />
                </Link>
              </section>
            </aside>
          )}
          {(show("vision") || show("apps")) && (
            <div className="settings-main">
              {show("vision") && (
                <section
                  className="settings-card settings-vision"
                  aria-label="AI vision and grounding configuration"
                >
                  <header>
                    <ScanLine size={18} />
                    <h2>AI Vision & Grounding Configuration</h2>
                    <span className="settings-tag">READ ONLY</span>
                  </header>
                  <dl className="settings-model-fields">
                    <div>
                      <dt>Primary vision model</dt>
                      <dd>{model?.model || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Provider configuration</dt>
                      <dd>{configured}</dd>
                    </div>
                    <div>
                      <dt>Last real analysis</dt>
                      <dd>{lastAnalysis}</dd>
                    </div>
                    <div>
                      <dt>Secondary fallback</dt>
                      <dd>Not configured</dd>
                    </div>
                  </dl>
                  <div className="settings-grounding-note">
                    <ScanLine size={18} />
                    <div>
                      <h3>Observation-bound visual grounding</h3>
                      <p>
                        Target coordinates are validated against the source
                        observation and viewport. Grounding thresholds are
                        managed by server configuration.
                      </p>
                      <Link to="/models">
                        Review AI Models <ArrowUpRight size={13} />
                      </Link>
                    </div>
                  </div>
                  <div
                    className="settings-permissions"
                    aria-label="Server feature switches"
                  >
                    {permissionRows.map(
                      ({ name, description, enabled, icon: Icon }) => (
                        <div key={name}>
                          <Icon size={17} />
                          <div>
                            <h3>{name}</h3>
                            <p>{description}</p>
                          </div>
                          <span
                            className={`settings-state ${enabled === true ? "settings-enabled" : ""}`}
                          >
                            {stateText(enabled)}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </section>
              )}
              {show("apps") && (
                <section
                  className="settings-card settings-apps"
                  aria-label="Connected applications"
                >
                  <header>
                    <Boxes size={18} />
                    <h2>Connected Apps & Inventory Integration</h2>
                    <span className="settings-tag">LOCAL SANDBOX</span>
                  </header>
                  <div className="settings-app-target">
                    <div className="settings-app-icon">
                      <Boxes size={24} />
                    </div>
                    <div>
                      <h3>Hardware & IT Asset Inventory</h3>
                      <p>Existing local inventory application</p>
                    </div>
                    <span
                      className={`settings-state ${assets ? "settings-enabled" : ""}`}
                    >
                      {inventoryQuery.isError
                        ? "Unavailable"
                        : assets
                          ? "Reachable"
                          : "Checking"}
                    </span>
                  </div>
                  <dl className="settings-app-facts">
                    <div>
                      <dt>Stored assets</dt>
                      <dd>{assets ? assets.length : "Unknown"}</dd>
                    </div>
                    <div>
                      <dt>Connection mode</dt>
                      <dd>Read-only catalog</dd>
                    </div>
                    <div>
                      <dt>Last checked on this device</dt>
                      <dd>
                        {assets
                          ? new Date(
                              inventoryQuery.dataUpdatedAt,
                            ).toLocaleString()
                          : "Unknown"}
                      </dd>
                    </div>
                  </dl>
                  <div className="settings-app-actions">
                    <Link to="/inventory">
                      View inventory <ArrowUpRight size={13} />
                    </Link>
                    <button
                      onClick={() => void inventoryQuery.refetch()}
                      disabled={inventoryQuery.isFetching}
                    >
                      <RefreshCw size={13} /> Check connection
                    </button>
                  </div>
                  <p className="settings-note">
                    Connection checks read stored records. Asset editing remains
                    in the inventory application.
                  </p>
                </section>
              )}
            </div>
          )}
        </div>
      )}
      {show("sandbox") && (
        <section
          className="settings-card settings-sandbox"
          aria-label="Sandbox services and API configuration"
        >
          <header>
            <Server size={18} />
            <h2>Sandboxes, Services & Meta API Configuration</h2>
            <span className="settings-tag settings-neutral">
              LOCAL CONFIGURATION
            </span>
          </header>
          <div className="settings-sandbox-grid">
            <section aria-label="Meta API configuration">
              <p className="settings-field-label">
                <KeyRound size={14} /> META DEVELOPER API
              </p>
              <strong>{configured}</strong>
              <p>
                {model?.detail || "Current model configuration unavailable."}
              </p>
              <span className="settings-state">
                Task calls: {stateText(capabilities?.model_calls_enabled)}
              </span>
              <small>Availability: {lastAnalysis}</small>
            </section>
            <section aria-label="Sandbox dependency checks">
              <p className="settings-field-label">
                <Server size={14} /> SANDBOX DEPENDENCIES
              </p>
              <dl className="settings-dependencies">
                {[
                  { label: "Backend", value: system?.backend },
                  { label: "Observation store", value: system?.database },
                  { label: "Browser engine", value: system?.browser },
                ].map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{stateText(item.value, "Available", "Unavailable")}</dd>
                  </div>
                ))}
              </dl>
              <small>Application version: {system?.version || "Unknown"}</small>
            </section>
            <section
              className="settings-session-controls"
              aria-label="Execution session controls"
            >
              <p className="settings-field-label">
                <ShieldCheck size={14} /> SESSION CONTROLS
              </p>
              <h3>Review and control an execution</h3>
              <p>
                Approvals, pause and cancellation apply to the selected
                execution in Live Execution.
              </p>
              <Link to="/execution">
                Open execution controls <ArrowUpRight size={13} />
              </Link>
              <small>No global stop operation is exposed here.</small>
            </section>
          </div>
          <div className="settings-service-summary">
            <Activity size={17} />
            <div>
              <strong>Observation service readiness</strong>
              <span>{stateText(system?.ready, "Ready", "Degraded")}</span>
            </div>
            <small>
              Dependency readiness is separate from model availability and task
              verification.
            </small>
          </div>
          <details className="settings-config-guide">
            <summary>Local configuration guide</summary>
            <p>
              Configure <code>META_API_KEY</code> and <code>META_MODEL_ID</code>{" "}
              in the private local <code>.env</code> file. Server feature
              switches use <code>MISSION_MODEL_CALLS_ENABLED</code>,{" "}
              <code>EXECUTION_ENABLED</code>, <code>VERIFICATION_ENABLED</code>{" "}
              and <code>RECOVERY_ENABLED</code>. Restart the backend after
              changing server configuration.
            </p>
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
            >
              Open API documentation <ArrowUpRight size={13} />
            </a>
          </details>
        </section>
      )}
      <div className="settings-audit-note">
        <RefreshCw size={15} />
        <span>
          {complete
            ? "Current diagnostics loaded"
            : "Current diagnostics incomplete"}
        </span>
        <small>
          Read-only server configuration · local access is temporary · no
          configuration changes are saved by this page.
        </small>
      </div>
    </div>
  );
}
