import {
  CheckCircle2,
  ExternalLink,
  Hourglass,
  LockKeyhole,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { ModelStatus } from "../../types/api";
import type { PlannedAction, PlanningResult } from "../../types/planning";

export function StudioPanels({
  model,
  result,
  origin,
  busy,
  callsEnabled,
}: {
  model?: ModelStatus;
  result: PlanningResult | null;
  origin?: string;
  busy: boolean;
  callsEnabled: boolean;
}) {
  const actions = result?.plan.actions ?? [];
  const usage = result?.model_usage ?? [];
  const tokensKnown =
    usage.length > 0 &&
    usage.every(
      (item) => item.input_tokens !== null && item.output_tokens !== null,
    );
  const tokens = tokensKnown
    ? usage.reduce(
        (sum, item) => sum + item.input_tokens! + item.output_tokens!,
        0,
      )
    : null;
  const observedHost = (() => {
    try {
      return origin ? new URL(origin).host : "No observation selected";
    } catch {
      return "Origin unavailable";
    }
  })();
  return (
    <>
      <section
        className="studio-card studio-engine"
        aria-labelledby="studio-engine-title"
      >
        <div className="studio-card-heading">
          <h2 id="studio-engine-title">Active Intelligence Engine</h2>
          <span
            className={`health-dot ${busy ? "checking" : callsEnabled ? "online" : "idle"}`}
            aria-hidden="true"
          />
        </div>
        <div className="studio-engine-body">
          <div className="studio-card-heading">
            <h3>
              {result && !usage.length
                ? "Authored sandbox plan"
                : (usage.at(-1)?.model ??
                  model?.model ??
                  "Meta visual reasoning")}
            </h3>
            <span className="studio-tag">
              {busy ? "PREPARING" : callsEnabled ? "ENABLED" : "UNAVAILABLE"}
            </span>
          </div>
          <p className="studio-eyebrow">
            {result && !usage.length
              ? "EXPLICIT RECIPE · NO MODEL INFERENCE"
              : "VISUAL REASONING & TYPED PLANNING"}
          </p>
          <p>
            {callsEnabled
              ? "Observed interfaces become inspectable plans. Actions remain subject to explicit authorization."
              : "Real model calls are unavailable. You can inspect saved plans and their recorded provenance."}
          </p>
          <dl>
            <div>
              <dt>Model access</dt>
              <dd>
                {model?.available === true
                  ? "Verified available"
                  : model?.configured
                    ? "Configured · unverified"
                    : model
                      ? "Not configured"
                      : "Checking"}
              </dd>
            </div>
            <div>
              <dt>Recorded model calls</dt>
              <dd>{result ? usage.length : "No plan loaded"}</dd>
            </div>
            <div>
              <dt>Recorded tokens</dt>
              <dd>{tokens ?? "Unavailable"}</dd>
            </div>
          </dl>
        </div>
        <Link className="studio-inline-link" to="/models">
          Inspect model configuration <ExternalLink size={12} />
        </Link>
      </section>
      <section
        className="studio-card studio-scope"
        aria-labelledby="studio-scope-title"
      >
        <div className="studio-card-heading">
          <h2 id="studio-scope-title">
            <ShieldCheck size={20} aria-hidden="true" />
            Scope Matrix
          </h2>
          <span className="studio-tag">POLICY GATED</span>
        </div>
        <p className="studio-eyebrow">OBSERVED APPLICATION</p>
        <p className="studio-host">{observedHost}</p>
        <p className="studio-small-note">
          Observation origin is evidence, not an authorization grant. Navigation
          stays subject to the backend allowlist.
        </p>
        <p className="studio-eyebrow">REQUESTED PLAN CAPABILITIES</p>
        <div className="studio-capabilities">
          {actions.length ? (
            [...new Set(actions.map((action) => action.action_type))].map(
              (type) => (
                <span key={type}>
                  <CheckCircle2 size={13} />
                  {type.replaceAll("_", " ")}
                </span>
              ),
            )
          ) : (
            <p>Load a plan to inspect its requested actions.</p>
          )}
        </div>
        <p className="studio-eyebrow">EXECUTION BOUNDARIES</p>
        <div className="studio-boundary">
          <LockKeyhole size={14} />
          <span>Separate plan and HIGH-risk approvals</span>
        </div>
        <div className="studio-boundary studio-blocked">
          <ShieldX size={14} />
          <span>Arbitrary scripts and unrestricted navigation</span>
        </div>
      </section>
      <section
        className="studio-card"
        aria-labelledby="studio-safeguards-title"
      >
        <div className="studio-card-heading">
          <h2 id="studio-safeguards-title">Execution Safeguards</h2>
          <span className="studio-tag">PLAN FACTS</span>
        </div>
        <div className="studio-safeguards">
          <Fact
            label="Planned actions"
            value={result ? actions.length : "—"}
            note="Reviewed before execution"
          />
          <Fact
            label="HIGH-risk actions"
            value={
              result
                ? actions.filter((action) => action.risk_level === "HIGH")
                    .length
                : "—"
            }
            note="Separate approval required"
          />
          <Fact
            label="Observation gates"
            value={
              result
                ? actions.filter((action) => action.target.requires_observation)
                    .length
                : "—"
            }
            note="Fresh evidence required"
          />
          <Fact
            label="Execution authority"
            value="Not granted"
            note="Planning grants no permission"
          />
        </div>
      </section>
      <section className="studio-card studio-agent-state">
        <Hourglass size={24} aria-hidden="true" />
        <div>
          <p className="studio-eyebrow">AGENT STATE</p>
          <strong>
            {busy
              ? "PREPARING PLAN"
              : result
                ? result.plan.status === "valid"
                  ? "AWAITING AUTHORIZATION"
                  : "PLAN REVIEW REQUIRED"
                : "STANDBY · AWAITING OBJECTIVE"}
          </strong>
          <small>
            {result
              ? `${actions.length} typed actions · ${result.plan.status.replaceAll("_", " ")}`
              : "No browser action has been authorized here."}
          </small>
        </div>
      </section>
    </>
  );
}
function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

export function FocusedStep({
  action,
  result,
}: {
  action?: PlannedAction;
  result: PlanningResult;
}) {
  if (!action) return null;
  const bounds = result.scene.elements.find(
    (element) => element.id === action.target.element_id,
  )?.bounding_box;
  return (
    <div className="studio-focused-step">
      <div className="studio-card-heading">
        <span>FOCUSED INSPECTOR</span>
        <code>{action.id}</code>
      </div>
      <div className="studio-focused-grid">
        <div>
          <small>Target bounding box</small>
          <strong>
            {bounds
              ? `[${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height}] ${bounds.coordinate_system}`
              : "Requires fresh localization"}
          </strong>
        </div>
        <div>
          <small>Expected result</small>
          <strong>
            {action.expected_postconditions[0] ?? "No condition declared"}
          </strong>
        </div>
        <div>
          <small>Observation gate</small>
          <strong>
            {action.target.requires_observation
              ? "Fresh observation required"
              : action.target.source.replaceAll("_", " ")}
          </strong>
        </div>
      </div>
      <p>
        Coordinates are recorded estimates; execution must resolve and validate
        its live target.
      </p>
    </div>
  );
}
