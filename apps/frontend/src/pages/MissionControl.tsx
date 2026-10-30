import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  FlaskConical,
  Lock,
  Play,
  Radar,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useOperator } from "../hooks/useOperator";
import { OperatorConnection } from "../components/OperatorConnection";
import { useSystem, useModel } from "../hooks/useSystem";
import { missionApi, benchmarkApi } from "../services/missionApi";
import { errorMessage } from "../services/api";
import { VerdictBadge } from "../features/verification/VerdictBadge";
import { PlanTimeline } from "../features/planning/PlanTimeline";
import { RatioMetric } from "../components/RatioMetric";
import type {
  DemoState,
  Mission,
  MissionDetail,
  MissionOverview,
} from "../types/mission";
import "../styles/mission.css";

const stages = ["PERCEIVE", "REASON", "PLAN", "ACT", "RECOVER", "VERIFY"];
export function MissionControl() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const guided = search.get("guided") === "1";
  const { token, notify } = useOperator();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const system = useSystem();
  const model = useModel();
  const [goal, setGoal] = useState(
    "Find asset PC-104, change its status to Operational, and verify the persisted result.",
  );
  const [mode, setMode] = useState<Mission["mode"]>("authored_demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const overview = useQuery({
    queryKey: ["mission-control", token],
    queryFn: () => missionApi.overview(token),
    enabled: !!token,
    refetchInterval: 5000,
  });
  const mission = useQuery({
    queryKey: ["mission", id, token],
    queryFn: () => missionApi.get(id!, token),
    enabled: !!id && !!token,
    refetchInterval: 3000,
  });
  const benchmarks = useQuery({
    queryKey: ["benchmarks"],
    queryFn: benchmarkApi.list,
    staleTime: 60000,
  });
  const source = benchmarks.data?.items.find(
    (r) => r.report_id === "verification",
  );
  const demo = useQuery({
    queryKey: ["demo-state", token],
    queryFn: () => missionApi.demo(token),
    enabled: !!token && !!overview.data?.demo_controls_enabled,
    refetchInterval: 5000,
    retry: false,
  });
  const canModel =
    !!model.data?.configured && !!overview.data?.model_calls_enabled;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
      await cache.invalidateQueries({ queryKey: ["mission", id, token] });
      await cache.invalidateQueries({ queryKey: ["mission-control"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mission-workspace">
      <div className="mission-hero">
        <div>
          <p className="eyebrow">
            INTELLIGENT NAVIGATION, TASK EXECUTION & INTERACTION
          </p>
          <h1>
            Mission Control<span className="gold-dot">.</span>
          </h1>
          <p>From an objective to an outcome you can inspect.</p>
          <div className="mission-lifecycle">
            {stages.map((s, i) => (
              <span key={s}>
                {i > 0 && <b>→</b>}
                {s}
              </span>
            ))}
          </div>
        </div>
        <Radar size={88} strokeWidth={0.65} aria-hidden="true" />
      </div>
      <div className="mission-status-grid" aria-label="System overview">
        <Health
          label="Backend"
          value={
            system.error
              ? "Unavailable"
              : system.data?.backend
                ? "Online"
                : "Checking"
          }
        />
        <Health
          label="Browser engine"
          value={
            system.data?.browser
              ? "Ready"
              : system.error
                ? "Unknown"
                : "Checking"
          }
        />
        <Health
          label="Database"
          value={
            system.data?.database
              ? "Connected"
              : system.error
                ? "Unknown"
                : "Checking"
          }
        />
        <Health
          label="Meta model"
          value={
            model.data?.available === true
              ? "Verified available"
              : model.data?.configured
                ? "Configured · unverified"
                : model.data
                  ? "Not configured"
                  : "Checking"
          }
        />
        <Health
          label="Active executions"
          value={
            overview.data
              ? String(overview.data.active_executions)
              : "Connect to inspect"
          }
        />
      </div>
      <OperatorConnection />
      {(error || overview.error || mission.error || system.error) && (
        <p role="alert" className="mission-error">
          {error ||
            errorMessage(overview.error || mission.error || system.error)}
        </p>
      )}
      <div className="mission-section-title">
        <p className="mission-muted">
          One mission ID follows the plan, approvals, execution and evidence.
        </p>
        <Link
          className="mission-link"
          to={id ? `/missions/${id}?guided=1` : "/?guided=1"}
        >
          <Play size={14} /> Guided demo
        </Link>
      </div>
      {guided && (
        <GuidedTracker
          detail={mission.data}
          overview={overview.data}
          demo={demo.data}
          canModel={canModel}
          hasBenchmark={!!source}
        />
      )}
      <div className="mission-columns">
        <div className="mission-primary">
          {!id && (
            <section className="mission-card">
              <div className="mission-section-title">
                <h2>Quick task</h2>
                <span className="mission-source">
                  LOCAL SYNTHETIC INVENTORY
                </span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const created = await missionApi.create(
                      goal.trim(),
                      mode,
                      token,
                    );
                    notify(
                      "Mission created. Review its planning source and prepare it explicitly.",
                    );
                    navigate(
                      `/missions/${created.id}${guided ? "?guided=1" : ""}`,
                    );
                  });
                }}
              >
                <label htmlFor="mission-objective">
                  What should INTI accomplish?
                </label>
                <textarea
                  id="mission-objective"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  required
                />
                <div className="mission-input-grid">
                  <label>
                    Target application
                    <select value="inventory" disabled>
                      <option value="inventory">
                        INTI synthetic inventory
                      </option>
                    </select>
                  </label>
                  <label>
                    Planning source
                    <select
                      value={mode}
                      onChange={(e) =>
                        setMode(e.target.value as Mission["mode"])
                      }
                    >
                      <option value="authored_demo">
                        Authored sandbox · no model
                      </option>
                      <option value="meta">Meta visual reasoning</option>
                    </select>
                  </label>
                </div>
                <p className="mission-note">
                  {mode === "authored_demo"
                    ? "An explicitly authored nine-step PC-104 recipe. Browser actions and independent verification are real; this is not AI-generated planning."
                    : "Uses the actual Meta scene, intent and planning pipeline. Missing access produces a dependency error; no fallback plan is substituted."}
                </p>
                <button
                  className="button primary"
                  disabled={!token || busy || !goal.trim()}
                >
                  <ArrowRight size={16} /> Create mission
                </button>
              </form>
            </section>
          )}
          {id && !token && (
            <section className="mission-card">
              <h2>Connect to open this mission</h2>
              <p>
                Mission details, approvals and execution evidence require your
                operator capability.
              </p>
            </section>
          )}
          {mission.isLoading && (
            <p role="status">Loading mission and linked evidence…</p>
          )}
          {mission.data && (
            <ActiveMission
              detail={mission.data}
              token={token}
              busy={busy}
              canModel={
                !!model.data?.configured && !!overview.data?.model_calls_enabled
              }
              run={run}
              notify={notify}
            />
          )}
          <section className="mission-card">
            <div className="mission-section-title">
              <h2>Recent missions</h2>
              <Link className="mission-link" to="/">
                New task <ArrowRight size={13} />
              </Link>
            </div>
            {!token && (
              <p className="mission-muted">
                Connect to inspect your mission history.
              </p>
            )}
            {overview.data?.missions.length === 0 && (
              <p>No missions yet. Create a task above to begin.</p>
            )}
            <div className="mission-list">
              {overview.data?.missions.map((m) => (
                <Link to={`/missions/${m.id}`} key={m.id}>
                  <div>
                    <strong>{m.objective}</strong>
                    <small>
                      {m.mode === "meta"
                        ? "Meta pipeline"
                        : "Authored · no model"}{" "}
                      · {new Date(m.created_at).toLocaleString()}
                    </small>
                  </div>
                  <span>{m.status.replaceAll("_", " ")}</span>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          </section>
          <section className="mission-card">
            <div className="mission-section-title">
              <h2>Recent activity</h2>
              <span className="mission-source">PERSISTED EVENTS</span>
            </div>
            {!overview.data?.recent_events.length && (
              <p className="mission-muted">
                No visible event history. Events appear after connected planning
                and execution.
              </p>
            )}
            <ol className="mission-activity">
              {overview.data?.recent_events.map((e) => (
                <li key={e.id}>
                  <time>{new Date(e.timestamp).toLocaleTimeString()}</time>
                  <span className="activity-source">{e.source}</span>
                  <span>{e.event_type.replaceAll("_", " ")}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="mission-secondary">
          <section className="mission-card">
            <div className="mission-section-title">
              <h2>Evaluation snapshot</h2>
              <FlaskConical size={18} className="accent" />
            </div>
            {benchmarks.error && (
              <p role="alert">{errorMessage(benchmarks.error)}</p>
            )}
            {!source && !benchmarks.isLoading && (
              <p>No measured verification report is available.</p>
            )}
            {source && (
              <>
                <p className="mission-source">
                  ACTUAL LOCAL IO · ZERO MODEL CALLS
                </p>
                <RatioMetric
                  label="Expected verdict agreement"
                  ratio={source.data.verdict_accuracy}
                />
                <RatioMetric
                  label="False positives detected"
                  ratio={source.data.false_positive_detection_rate}
                />
                <p className="mission-note">
                  {source.data.scenarios} isolated fault trials. This does not
                  measure Meta quality or comparative agent reliability.
                </p>
              </>
            )}
            <Link className="mission-link" to="/benchmarks">
              Inspect Benchmark Lab <ArrowRight size={14} />
            </Link>
          </section>
          <section className="mission-card">
            <div className="mission-section-title">
              <h2>Latest independent verdict</h2>
              <ShieldCheck size={17} className="accent" />
            </div>
            <VerdictBadge verdict={overview.data?.latest_verdict} />
            <p className="mission-muted">
              {overview.data?.latest_verdict
                ? "Historical report verdict, with stored evidence integrity checked."
                : "No verification verdict is stored yet. Execution completion is not a verdict."}
            </p>
            <Link className="mission-link" to="/verification">
              Open Verification Center <ArrowRight size={14} />
            </Link>
          </section>
          <section className="mission-card">
            <div className="mission-section-title">
              <h2>Capability status</h2>
              <span className="mission-source">FROM BACKEND CONFIG</span>
            </div>
            <ul className="feature-status">
              {(
                [
                  [
                    "Browser execution",
                    overview.data?.features.execution_enabled,
                  ],
                  [
                    "Independent verification",
                    overview.data?.features.verification_enabled,
                  ],
                  [
                    "Recovery mechanics",
                    overview.data?.features.recovery_enabled,
                  ],
                  [
                    "Live Meta recovery",
                    overview.data?.features.recovery_live_model_enabled,
                  ],
                  ["Meta model calls", overview.data?.model_calls_enabled],
                  [
                    "Demo reset controls",
                    overview.data?.features.demo_controls_enabled,
                  ],
                ] as [string, boolean | undefined][]
              ).map(([label, enabled]) => (
                <li key={label}>
                  <span
                    className={`health-dot ${enabled ? "online" : "unavailable"}`}
                    aria-hidden="true"
                  />
                  {label}
                  <strong>{enabled ? "Enabled" : "Unavailable"}</strong>
                </li>
              ))}
            </ul>
            {!overview.data?.features.recovery_live_model_enabled && (
              <p className="mission-note">
                Live Meta recovery is unavailable. Recovery mechanics are
                exercised through the explicitly labeled fixture-based
                integration test, not a live model call.
              </p>
            )}
          </section>
          <DemoReset
            enabled={!!overview.data?.demo_controls_enabled}
            token={token}
            run={run}
            busy={busy}
          />
          <section className="mission-card">
            <h2>Recent verification records</h2>
            <p className="mission-muted">
              Historical verdicts; open the report to validate stored evidence
              integrity.
            </p>
            <div className="mission-list">
              {overview.data?.recent_verifications.map((v) => (
                <Link
                  key={v.session.id}
                  to={`/verification?verification=${v.session.id}&execution=${v.session.execution_id}`}
                >
                  <div>
                    <strong>
                      {v.session.final_verdict || v.session.status}
                    </strong>
                    <small>{v.criteria_version.objective}</small>
                  </div>
                  <ArrowRight size={13} />
                </Link>
              ))}
            </div>
            {!overview.data?.recent_verifications.length && (
              <p className="mission-muted">No records loaded.</p>
            )}
          </section>
        </aside>
      </div>
      {busy && (
        <p role="status" className="mission-note">
          Working with the real backend. Planning and browser operations can
          take time.
        </p>
      )}
    </div>
  );
}

export function GuidedTracker({
  detail,
  overview,
  demo,
  canModel,
  hasBenchmark,
}: {
  detail?: MissionDetail;
  overview?: MissionOverview;
  demo?: DemoState;
  canModel: boolean;
  hasBenchmark: boolean;
}) {
  const execution = detail?.execution;
  const recoveries = detail?.recoveries ?? [];
  const verifications = detail?.verifications ?? [];
  const approvalsComplete =
    !!execution?.plan_approved &&
    execution.manifest.actions.every((action) =>
      execution.decisions.some(
        (decision) =>
          decision.action_id === action.id && decision.decision === "APPROVED",
      ),
    );
  const executed = execution?.session.status === "COMPLETED";
  const executionFailed =
    !!execution &&
    ["FAILED", "CANCELLED", "TIMED_OUT"].includes(execution.session.status);
  const recovered =
    !!detail?.mission.fault_injected &&
    recoveries.some((r) => r.session.status === "RECOVERED");
  const recoveryFailed = recoveries.some((r) =>
    ["FAILED", "CANCELLED", "ESCALATED"].includes(r.session.status),
  );
  const verdict = detail?.verification_report?.effective_verdict;
  const resetDone =
    (demo?.asset.status === "Inactive" && demo?.faults_active === false) ||
    (!!detail?.verification_report?.criteria_version.baseline &&
      detail.verification_report.integrity_checks.every(
        (item) => item.intact,
      ) &&
      detail.verification_report.criteria_results.some(
        (result) =>
          result.observed_value &&
          typeof result.observed_value === "object" &&
          result.observed_value.before === "Inactive",
      ));
  const raw: {
    label: string;
    detail: string;
    state: "done" | "pending" | "blocked";
  }[] = [
    {
      label: "Reset the synthetic store",
      detail: resetDone
        ? "PC-104 is Inactive and no UI faults are active."
        : overview?.demo_controls_enabled
          ? "Use Synthetic demo controls to restore PC-104 to Inactive."
          : "Restricted demo controls are not configured.",
      state: resetDone
        ? "done"
        : overview?.demo_controls_enabled
          ? "pending"
          : "blocked",
    },
    {
      label: "Create a mission",
      detail:
        detail || (overview?.mission_count ?? 0) > 0
          ? "A mission ID now links planning, approvals and evidence."
          : "Submit an objective. Authored mode makes no model calls.",
      state: detail || (overview?.mission_count ?? 0) > 0 ? "done" : "pending",
    },
    {
      label: "Prepare the plan",
      detail: detail?.mission.plan_id
        ? "Plan prepared. Its provenance is recorded."
        : detail?.mission.mode === "meta" && !canModel
          ? "Meta planning is blocked: model access is not available."
          : "Capture the interface and prepare the plan.",
      state: detail?.mission.plan_id
        ? "done"
        : detail?.mission.mode === "meta" && !canModel
          ? "blocked"
          : "pending",
    },
    {
      label: "Authorize execution",
      detail: approvalsComplete
        ? "The exact plan and HIGH save action were approved."
        : "Review the typed contracts and approve in Live Execution.",
      state: approvalsComplete ? "done" : "pending",
    },
    {
      label: "Execute in a real browser",
      detail: executed
        ? "All approved actions and immediate checks completed."
        : executionFailed
          ? `Execution stopped: ${execution?.session.status}.`
          : execution?.results.length
            ? `${execution.results.length} action result(s) recorded; execution is not complete.`
            : "Start the approved execution. Actions are not simulated.",
      state: executed ? "done" : executionFailed ? "blocked" : "pending",
    },
    {
      label: "Inject fault and recover",
      detail: recovered
        ? "The injected fault was recovered and original checks were confirmed."
        : recoveryFailed
          ? "Recovery stopped or escalated; no successful repair was established."
          : recoveries.length
            ? "Recovery is in progress; a recorded session does not establish success."
            : canModel
              ? "Arm the rename-and-relocate fault before starting the save."
              : "Blocked: live recovery needs real Meta access. Fixture-based recovery is labeled separately.",
      state: recovered
        ? "done"
        : recoveryFailed
          ? "blocked"
          : canModel
            ? "pending"
            : "blocked",
    },
    {
      label: "Independent verification",
      detail: verdict
        ? `Independent report verdict: ${verdict}.`
        : verifications.length
          ? "Collecting or evaluating evidence; no final verdict yet."
          : "The verifier runs independently of execution completion.",
      state: verdict ? "done" : "pending",
    },
    {
      label: "Inspect benchmark evidence",
      detail: hasBenchmark
        ? "Measured local verification report is available."
        : "No measured report is available.",
      state: hasBenchmark ? "done" : "pending",
    },
  ];
  const nextIndex = raw.findIndex((s) => s.state !== "done");
  const steps = raw.map((step, i) => ({
    ...step,
    current: i === nextIndex,
  }));
  const done = steps.filter((s) => s.state === "done").length;
  return (
    <section className="mission-guide" aria-label="Guided demo">
      <div className="mission-section-title">
        <div>
          <h2>INTI-DEMO-001 · judge walkthrough</h2>
          <p className="mission-muted">
            {done} of {steps.length} steps complete. State comes from the
            backend, not this checklist.
          </p>
        </div>
        <span className="mission-source">GUIDED · NO BYPASSES</span>
      </div>
      <ol className="guide-steps">
        {steps.map((step) => (
          <li
            key={step.label}
            className={`guide-step ${step.state}${step.current ? " current" : ""}`}
          >
            <span className="guide-icon" aria-hidden="true">
              {step.state === "done" ? (
                <CheckCircle2 size={16} />
              ) : step.state === "blocked" ? (
                <Lock size={15} />
              ) : (
                <Circle size={15} />
              )}
            </span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </div>
            {step.current && step.state !== "blocked" && (
              <span className="guide-next">NEXT</span>
            )}
            {step.state === "blocked" && (
              <span className="guide-blocked">BLOCKED</span>
            )}
          </li>
        ))}
      </ol>
      <p className="mission-note">
        Nothing in this guide grants approval or turns a replay into live
        activity. Blocked steps state the missing dependency instead of
        substituting a fixture.
      </p>
    </section>
  );
}

function Health({ label, value }: { label: string; value: string }) {
  return (
    <div className="mission-health">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ActiveMission({
  detail: d,
  token,
  busy,
  canModel,
  run,
  notify,
}: {
  detail: MissionDetail;
  token: string;
  busy: boolean;
  canModel: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
  notify: (message: string) => void;
}) {
  const m = d.mission;
  const [contracts, setContracts] = useState("[]");
  const execution = d.execution;
  const completed =
    execution?.results.filter((r) =>
      ["SUCCEEDED", "SATISFIED"].includes(r.status),
    ).length || 0;
  const q = `mission=${m.id}`;
  return (
    <section className="mission-card active-mission">
      <div className="mission-section-title">
        <div>
          <p className="eyebrow">ACTIVE MISSION · {m.id.slice(0, 8)}</p>
          <h2>{m.objective}</h2>
        </div>
        <span className="mission-source">{d.phase}</span>
      </div>
      <p className="mission-source">
        {m.mode === "authored_demo"
          ? "AUTHORED PLAN · NO MODEL REASONING"
          : "META PLANNING PIPELINE"}
      </p>
      <p className="mission-muted">
        Task ID: <code>{m.id}</code>
      </p>
      {m.error_code && (
        <p role="alert" className="mission-error">
          {m.error_code}. Review configuration or retry preparation; no
          successful outcome was assumed.
        </p>
      )}
      <div className="mission-stages">
        {stages.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <div className="mission-stats">
        <div>
          <small>Action progress</small>
          <strong>
            {completed} / {execution?.manifest.actions.length ?? 0}
          </strong>
        </div>
        <div>
          <small>Required approvals</small>
          <strong>
            {execution
              ? execution.session.status === "AWAITING_APPROVAL"
                ? "Review required"
                : execution.plan_approved
                  ? "Recorded"
                  : "Pending"
              : "Plan first"}
          </strong>
        </div>
        <div>
          <small>Latest event</small>
          <strong>
            {d.events.at(-1)?.event_type.replaceAll("_", " ") ||
              m.status.replaceAll("_", " ")}
          </strong>
        </div>
      </div>
      <div className="mission-actions">
        {!m.plan_id && (
          <button
            className="button primary"
            disabled={
              busy ||
              m.status === "PREPARING" ||
              (m.mode === "meta" && !canModel)
            }
            onClick={() =>
              void run(async () => {
                await missionApi.prepare(m.id, token);
                notify(
                  "Plan prepared. Approval and start remain separate decisions.",
                );
              })
            }
          >
            Capture interface & prepare plan
          </button>
        )}
        {m.plan_id && (
          <Link
            className="button secondary"
            to={`/planning?plan=${m.plan_id}&${q}`}
          >
            Inspect plan <ArrowRight size={14} />
          </Link>
        )}
        {m.execution_id && (
          <Link
            className="button primary"
            to={`/execution?execution=${m.execution_id}&${q}`}
          >
            <Play size={14} /> Review & run execution
          </Link>
        )}
        {d.recoveries.map((r) => (
          <Link
            className="button secondary"
            key={r.session.id}
            to={`/recovery?recovery=${r.session.id}&${q}`}
          >
            Recovery · {r.session.status}
          </Link>
        ))}
        {d.verifications[0] && (
          <Link
            className="button secondary"
            to={`/verification?verification=${d.verifications[0].session.id}&execution=${m.execution_id}&${q}`}
          >
            <ShieldCheck size={15} /> Inspect outcome evidence
          </Link>
        )}
      </div>
      {m.mode === "meta" && !canModel && (
        <p className="mission-note">
          Live Meta calls are disabled or model access is unavailable. This
          mission has no generated plan. The separately labeled authored sandbox
          can demonstrate execution and verification.
        </p>
      )}
      {m.plan_id && !m.execution_id && (
        <details>
          <summary>Prepare execution from reviewed typed contracts</summary>
          <p>
            Natural-language model postconditions do not authorize actions.
            Supply exact targets and typed before/after assertions for every
            proposed step; the existing execution policy validates them.
          </p>
          <label htmlFor="mission-contracts">
            Typed action contracts (JSON)
          </label>
          <textarea
            id="mission-contracts"
            value={contracts}
            onChange={(e) => setContracts(e.target.value)}
            rows={8}
          />
          <button
            className="button secondary"
            disabled={busy}
            onClick={() =>
              void run(() =>
                missionApi.prepareExecution(m.id, JSON.parse(contracts), token),
              )
            }
          >
            Validate execution contracts
          </button>
        </details>
      )}
      {m.execution_id && !m.fault_injected && (
        <div className="mission-note">
          <strong>INTI-DEMO-001 · rename + relocate Save</strong>
          <p>
            {m.fault_armed
              ? "Armed for the approved Save action. No successful recovery is assumed."
              : "The live fault path requires real Meta recovery. It does not use a fixture response."}
          </p>
          <button
            className="button secondary"
            disabled={
              busy ||
              !canModel ||
              m.fault_armed ||
              !execution ||
              !["AWAITING_APPROVAL", "READY"].includes(execution.session.status)
            }
            onClick={() => void run(() => missionApi.arm(m.id, token))}
          >
            Arm authorized demo fault
          </button>
        </div>
      )}
      {d.verification_report && (
        <div className="mission-outcome">
          <div>
            <small>Independent verdict</small>
            <VerdictBadge verdict={d.verification_report.effective_verdict} />
          </div>
          <p>
            The report compares fresh persisted state with approved criteria.
            Execution completion alone does not determine this verdict.
          </p>
        </div>
      )}
      {d.plan && (
        <details>
          <summary>
            Review {d.plan.plan.actions.length} planned actions and provenance
          </summary>
          <PlanTimeline plan={d.plan.plan} />
          <p>{d.plan.validation_summary}</p>
          <p>
            Model calls recorded: {d.plan.model_usage.length}. No model usage is
            inferred.
          </p>
        </details>
      )}
    </section>
  );
}

function DemoReset({
  enabled,
  token,
  run,
  busy,
}: {
  enabled: boolean;
  token: string;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  const cache = useQueryClient();
  const state = useQuery({
    queryKey: ["demo-state", token],
    queryFn: () => missionApi.demo(token),
    enabled: enabled && !!token,
    refetchInterval: 5000,
    retry: false,
  });
  return (
    <section className="mission-card">
      <div className="mission-section-title">
        <h2>Synthetic demo controls</h2>
        <RotateCcw size={17} />
      </div>
      {!enabled ? (
        <p className="mission-muted">
          Reset is disabled until restricted demo controls are configured.
        </p>
      ) : (
        <>
          <p>
            PC-104 ·{" "}
            <strong>{state.data?.asset.status || "Checking store"}</strong>
          </p>
          <p className="mission-muted">
            Resets this synthetic record and UI faults. Historical evidence and
            benchmarks are preserved.
          </p>
          {state.error && (
            <p role="alert" className="mission-error">
              {errorMessage(state.error)}
            </p>
          )}
          <button
            className="button secondary"
            disabled={busy || !state.data?.synthetic}
            onClick={() => setConfirm(true)}
          >
            Reset demo
          </button>
          {confirm && state.data && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Confirm synthetic demo reset"
              className="mission-confirm"
            >
              <h3>Reset PC-104 to Inactive?</h3>
              <p>
                Only the marked synthetic store{" "}
                <code>{state.data.store_id}</code> is affected. Active execution
                or verification blocks reset.
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await missionApi.reset(state.data.store_id, token);
                    setConfirm(false);
                    await cache.invalidateQueries({ queryKey: ["demo-state"] });
                  })
                }
              >
                Confirm synthetic reset
              </button>
              <button
                className="button secondary"
                onClick={() => setConfirm(false)}
              >
                Keep current state
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
