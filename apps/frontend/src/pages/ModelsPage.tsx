import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BrainCircuit,
  Camera,
  CheckCheck,
  Cpu,
  Eye,
  Gauge,
  Layers3,
  RefreshCw,
  ScanLine,
  Server,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useModel, useSystem } from "../hooks/useSystem";
import { api, errorMessage } from "../services/api";
import type { Observation } from "../types/api";
import "../styles/models.css";

const switchText = (enabled: boolean | undefined) =>
  enabled === undefined ? "Unknown" : enabled ? "Enabled" : "Disabled";

export function ModelsPage() {
  const modelQuery = useModel();
  const systemQuery = useSystem();
  const capabilities = useQuery({
    queryKey: ["capabilities"],
    queryFn: api.capabilities,
    refetchInterval: 30000,
    retry: false,
  });
  const observations = useQuery({
    queryKey: ["observations"],
    queryFn: api.observations,
    refetchInterval: 30000,
    retry: false,
  });
  const model = !modelQuery.isError ? modelQuery.data : undefined;
  const system = !systemQuery.isError ? systemQuery.data : undefined;
  const flags = !capabilities.isError ? capabilities.data : undefined;
  const frame = !observations.isError ? observations.data?.[0] : undefined;
  const [guideOpen, setGuideOpen] = useState(false);
  const refreshing =
    modelQuery.isFetching ||
    systemQuery.isFetching ||
    capabilities.isFetching ||
    observations.isFetching;
  const refresh = () => {
    void modelQuery.refetch();
    void systemQuery.refetch();
    void capabilities.refetch();
    void observations.refetch();
  };
  const connection = !model
    ? "Unknown"
    : model.configured
      ? "Configured"
      : "Not configured";
  const availability =
    !model || model.available == null
      ? "Not established"
      : model.available
        ? "Last analysis succeeded"
        : "Last analysis failed";
  const errors = [
    modelQuery.error,
    systemQuery.error,
    capabilities.error,
    observations.error,
  ].filter(Boolean);
  const metrics = [
    {
      title: "Model throughput",
      icon: Eye,
      unit: "tokens / second",
      detail: "No recorded throughput measurement",
      color: "cyan",
    },
    {
      title: "Mean inference latency",
      icon: Gauge,
      unit: "milliseconds",
      detail: "No recorded inference timing series",
      color: "green",
    },
    {
      title: "Dedicated GPU memory",
      icon: Cpu,
      unit: "GB VRAM",
      detail: "Remote provider memory is not exposed",
      color: "gold",
    },
    {
      title: "Grounding precision",
      icon: ShieldCheck,
      unit: "evaluation score",
      detail: "No comparative accuracy evaluation",
      color: "cyan",
    },
  ];
  return (
    <div className="models-workspace">
      <header className="models-heading">
        <div>
          <p className="models-eyebrow">
            <span>INTELLIGENCE / MODEL RUNTIME</span>
            <span className="models-neutral">{connection}</span>
          </p>
          <h1>AI Models & Multi-Modal Engines</h1>
          <p>
            Inspect the inference adapter, visual grounding and execution
            services behind INTI AI.
          </p>
        </div>
        <div className="models-heading-actions">
          <Link to="/benchmarks">
            <Gauge size={15} /> View benchmarks
          </Link>
          <button
            className="models-primary"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw size={15} /> Refresh diagnostics
          </button>
        </div>
      </header>
      {errors.length > 0 && (
        <div role="alert" className="models-error">
          {[...new Set(errors.map(errorMessage))].map((message) => (
            <p key={message}>{message}</p>
          ))}
          <small>
            Unavailable sources are withdrawn until diagnostics recover.
          </small>
        </div>
      )}
      <div className="models-metrics">
        {metrics.map(({ title, icon: Icon, unit, detail, color }) => (
          <section
            key={title}
            aria-label={title}
            className={`models-metric-${color}`}
          >
            <div>
              <span>{title}</span>
              <Icon size={18} />
            </div>
            <strong>Not measured</strong>
            <small>{unit}</small>
            <p>{detail}</p>
            <div className="models-metric-rule" />
          </section>
        ))}
      </div>
      <div className="models-layout">
        <section
          className="models-main"
          aria-label="Inference architecture and runtimes"
        >
          <div className="models-section-heading">
            <h2>
              <Layers3 size={18} /> Inference Architecture & Runtimes
            </h2>
            <span>1 model adapter / supporting services</span>
          </div>
          <article
            className="models-card models-primary-adapter"
            aria-label="Primary model adapter"
          >
            <header>
              <div className="models-icon">
                <Eye size={23} />
              </div>
              <div className="models-card-title">
                <h2>{model?.model || "Model identifier unavailable"}</h2>
                <div className="models-tags">
                  <span className="models-tag">PRIMARY ADAPTER</span>
                  <span
                    className={`models-tag ${model?.configured ? "models-positive" : "models-neutral"}`}
                  >
                    {connection}
                  </span>
                </div>
                <p>
                  Screenshot interpretation, structured planning and recovery
                  diagnosis through the configured Meta adapter.
                </p>
              </div>
              <button
                onClick={() => setGuideOpen(!guideOpen)}
                aria-expanded={guideOpen}
                aria-controls="model-configuration-guide"
              >
                <Settings2 size={14} /> Configuration guide
              </button>
            </header>
            {guideOpen && (
              <section
                className="models-guide"
                id="model-configuration-guide"
                aria-label="Model configuration guide"
              >
                <h3>Local model configuration</h3>
                <p>
                  The model identifier and credentials are managed in the
                  private local <code>.env</code> file. Set{" "}
                  <code>META_API_KEY</code> and <code>META_MODEL_ID</code>, then
                  restart the backend to apply changes.
                </p>
                <p>
                  <code>MISSION_MODEL_CALLS_ENABLED</code> controls model
                  requests in the task workflow. This page only reads
                  diagnostics.
                </p>
                <Link to="/system">
                  Open Settings <ArrowUpRight size={13} />
                </Link>
              </section>
            )}
            <dl className="models-facts" aria-label="Model connection">
              <div>
                <dt>Provider</dt>
                <dd>{model?.provider || "Unknown"}</dd>
              </div>
              <div>
                <dt>Configuration</dt>
                <dd>{connection}</dd>
              </div>
              <div>
                <dt>Last analysis</dt>
                <dd>{availability}</dd>
              </div>
              <div>
                <dt>Task model calls</dt>
                <dd>{switchText(flags?.model_calls_enabled)}</dd>
              </div>
            </dl>
            <div className="models-route">
              <div>
                <BrainCircuit size={18} />
                <span>MODEL REQUEST POLICY</span>
              </div>
              <strong
                className={
                  model &&
                  flags &&
                  model.configured &&
                  flags.model_calls_enabled
                    ? "models-positive-text"
                    : "models-muted-text"
                }
              >
                {!model || !flags
                  ? "Unknown"
                  : !model.configured
                    ? "Blocked · model not configured"
                    : !flags.model_calls_enabled
                      ? "Blocked · calls disabled"
                      : "Allowed by configuration"}
              </strong>
              <p>{model?.detail || "Waiting for current model diagnostics."}</p>
              <small>
                Availability reflects the last real analysis. Refreshing
                diagnostics does not send an inference request.
              </small>
            </div>
            <div className="models-feature-row">
              <span>
                <Eye size={14} /> Screenshot input
              </span>
              <span>
                <Layers3 size={14} /> Structured output
              </span>
              <span>
                <ShieldCheck size={14} /> Explicit task permissions
              </span>
            </div>
          </article>
          <article className="models-card models-grounding">
            <header>
              <div className="models-icon models-icon-secondary">
                <ScanLine size={22} />
              </div>
              <div className="models-card-title">
                <h2>Visual Grounding & Target Resolution</h2>
                <div className="models-tags">
                  <span className="models-tag models-gold">
                    OBSERVATION BOUND
                  </span>
                </div>
              </div>
              <Link to="/observations">
                Inspect captures <ArrowUpRight size={13} />
              </Link>
            </header>
            <p>
              Model-provided coordinates are validated against the source
              observation and its viewport before targets are used.
            </p>
            <div className="models-grounding-checks">
              <div>
                <span>Identity</span>
                <strong>Matching observation</strong>
              </div>
              <div>
                <span>Geometry</span>
                <strong>Valid viewport bounds</strong>
              </div>
              <div>
                <span>Provenance</span>
                <strong>Recorded target source</strong>
              </div>
            </div>
            <footer>
              <CheckCheck size={16} />
              <span>
                Coordinate validation does not establish measured localization
                accuracy.
              </span>
            </footer>
          </article>
          <div className="models-runtime-pair">
            <article
              className="models-card"
              aria-label="Browser execution runtime"
            >
              <header>
                <div className="models-icon models-icon-secondary">
                  <Activity size={20} />
                </div>
                <h2>Browser Execution Runtime</h2>
                <span className="models-tag">SERVICE</span>
              </header>
              <p>
                Playwright / Chromium dispatches approved actions against the
                allowed application.
              </p>
              <dl className="models-runtime-facts">
                <div>
                  <dt>Browser dependency</dt>
                  <dd>
                    {system?.browser === undefined
                      ? "Unknown"
                      : system.browser
                        ? "Available"
                        : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Execution policy</dt>
                  <dd>{switchText(flags?.execution_enabled)}</dd>
                </div>
              </dl>
              <Link to="/execution">
                Open Live Execution <ArrowUpRight size={13} />
              </Link>
            </article>
            <article
              className="models-card"
              aria-label="Independent verification runtime"
            >
              <header>
                <div className="models-icon models-icon-secondary">
                  <ShieldCheck size={20} />
                </div>
                <h2>Independent Verification</h2>
                <span className="models-tag">SERVICE</span>
              </header>
              <p>
                Approved criteria are evaluated against fresh, independent
                read-only evidence.
              </p>
              <dl className="models-runtime-facts">
                <div>
                  <dt>Verification policy</dt>
                  <dd>{switchText(flags?.verification_enabled)}</dd>
                </div>
                <div>
                  <dt>Recovery policy</dt>
                  <dd>{switchText(flags?.recovery_enabled)}</dd>
                </div>
              </dl>
              <Link to="/verification">
                Open Verification Lab <ArrowUpRight size={13} />
              </Link>
            </article>
          </div>
        </section>
        <aside className="models-sidebar" aria-label="Runtime diagnostics">
          <section className="models-card" aria-label="Runtime environment">
            <header>
              <Server size={19} />
              <h2>Runtime Environment</h2>
              <span className="models-tag">LOCAL</span>
            </header>
            <dl className="models-environment">
              <div>
                <dt>Backend</dt>
                <dd>
                  {system?.backend === undefined
                    ? "Unknown"
                    : system.backend
                      ? "Available"
                      : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Observation store</dt>
                <dd>
                  {system?.database === undefined
                    ? "Unknown"
                    : system.database
                      ? "Available"
                      : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Application version</dt>
                <dd>{system?.version || "Unknown"}</dd>
              </div>
              <div>
                <dt>GPU / VRAM telemetry</dt>
                <dd>Unavailable</dd>
              </div>
              <div>
                <dt>Host memory telemetry</dt>
                <dd>Unavailable</dd>
              </div>
            </dl>
            <div className="models-credential-state">
              <span>META API CONFIGURATION</span>
              <strong>{connection}</strong>
              <p>Credential values stay in local configuration.</p>
            </div>
          </section>
          <section
            className="models-card"
            aria-label="Model routing and permissions"
          >
            <header>
              <Settings2 size={19} />
              <h2>Routing & Permissions</h2>
            </header>
            <p className="models-sidebar-note">
              Current server switches. Changes are managed in local
              configuration.
            </p>
            <dl className="models-policy">
              {[
                ["Model calls", flags?.model_calls_enabled],
                ["Execution", flags?.execution_enabled],
                ["Verification", flags?.verification_enabled],
                ["Recovery", flags?.recovery_enabled],
              ].map(([label, enabled]) => (
                <div key={String(label)}>
                  <dt>{label}</dt>
                  <dd
                    className={
                      enabled === true
                        ? "models-positive-text"
                        : "models-muted-text"
                    }
                  >
                    {switchText(enabled as boolean | undefined)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="models-policy-note">
              <span>Model selection</span>
              <strong>Single configured adapter</strong>
              <small>Automatic cross-model fallback is not configured.</small>
            </div>
            <Link to="/system">
              Review Settings <ArrowUpRight size={13} />
            </Link>
          </section>
          <section
            className="models-card models-observation"
            aria-label="Recorded visual input"
          >
            <header>
              <Camera size={17} />
              <h2>Recorded Visual Input</h2>
              <span className="models-tag">SAVED</span>
            </header>
            {frame ? (
              <RecordedModelFrame
                key={`${frame.id}:${frame.screenshot_url}`}
                observation={frame}
              />
            ) : (
              <div className="models-frame-empty">
                <Camera size={24} />
                <p>
                  {observations.isError
                    ? "Recorded input unavailable"
                    : observations.isPending
                      ? "Loading saved observation…"
                      : "No saved public observations"}
                </p>
                <small>
                  Capture and inspect observations in Visual Observations.
                </small>
              </div>
            )}
            <Link to={frame ? `/observations/${frame.id}` : "/observations"}>
              Inspect observation <ArrowUpRight size={13} />
            </Link>
          </section>
        </aside>
      </div>
      <p className="models-footnote">
        Read-only diagnostics · metrics require measured evidence ·
        configuration does not establish model availability.
      </p>
    </div>
  );
}

function RecordedModelFrame({ observation }: { observation: Observation }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <div className="models-recorded-frame">
        {failed ? (
          <p role="alert">Saved screenshot unavailable.</p>
        ) : (
          <img
            src={observation.screenshot_url}
            alt={`Recorded input: ${observation.page_title}`}
            onError={() => setFailed(true)}
          />
        )}
        <span>RECORDED CAPTURE / NOT A LIVE STREAM</span>
      </div>
      <dl className="models-frame-facts">
        <div>
          <dt>Viewport</dt>
          <dd>
            {observation.width} × {observation.height}
          </dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{new Date(observation.timestamp).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Analysis</dt>
          <dd>{observation.analysis_status}</dd>
        </div>
      </dl>
      <small className="models-sidebar-note">
        This capture does not establish that the currently configured model
        analyzed it.
      </small>
    </>
  );
}
