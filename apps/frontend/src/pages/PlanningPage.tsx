import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  ChevronRight,
  History,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { FocusedStep, StudioPanels } from "../features/planning/StudioPanels";
import "../styles/studio.css";
import { executionApi } from "../services/executionApi";
import { useOperator } from "../hooks/useOperator";
import { api, errorMessage } from "../services/api";
import { planningApi } from "../services/planningApi";
import { useModel } from "../hooks/useSystem";
import { SceneViewer } from "../features/planning/SceneViewer";
import { PlanTimeline } from "../features/planning/PlanTimeline";
import { PlanInspector } from "../features/planning/PlanInspector";
import type { PlanningResult, VisualScene } from "../types/planning";

export function PlanningPage() {
  const [goal, setGoal] = useState(
    "Find asset PC-104, change its status to Operational, and verify the persisted result.",
  );
  const [search, setSearch] = useSearchParams();
  const { token } = useOperator();
  const [protectedImage, setProtectedImage] = useState<{ id: string; url: string } | null>(null);
  const [previewLatest, setPreviewLatest] = useState(true);
  const [focusedStep, setFocusedStep] = useState(0);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const hydratedPlan = useRef("");
  const [constraints, setConstraints] = useState("");
  const [observationId, setObservationId] = useState("");
  const [offset, setOffset] = useState(0);
  const [manualPlan, setSelected] = useState<PlanningResult | null>(null);
  const linkedPlanId = search.get("plan");
  const linkedPlan = useQuery({
    queryKey: ["linked-plan", linkedPlanId],
    queryFn: () => planningApi.get(linkedPlanId!),
    enabled: !!linkedPlanId,
  });

  const [interpreted, setInterpreted] = useState<VisualScene | null>(null);
  const model = useModel();
  const client = useQueryClient();
  const observations = useQuery({
    queryKey: ["observations"],
    queryFn: api.observations,
  });
  const history = useQuery({
    queryKey: ["plans", offset],
    queryFn: () => planningApi.list(offset),
  });
  const selected =
    manualPlan ||
    (linkedPlanId
      ? (linkedPlan.data ?? null)
      : previewLatest
        ? (history.data?.items[0] ?? null)
        : null);
  const capabilities = useQuery({
    queryKey: ["capabilities"],
    queryFn: api.capabilities,
  });
  const callsEnabled =
    model.data?.configured === true &&
    capabilities.data?.model_calls_enabled === true;
  useEffect(() => {
    if (selected && hydratedPlan.current !== selected.plan.id) {
      hydratedPlan.current = selected.plan.id;
      setGoal(selected.plan.goal);
      setConstraints(selected.intent.constraints.join("\n"));
      setObservationId(selected.plan.observation_id);
      setFocusedStep(0);
    }
  }, [selected]);
  const chosenId = observationId || observations.data?.[0]?.id || "";
  const activeId = selected?.plan.id;
  const events = useQuery({
    queryKey: ["plan-events", activeId],
    queryFn: () => planningApi.events(activeId!),
    enabled: Boolean(activeId),
  });
  const selectedObservation = useQuery({
    queryKey: ["planning-observation", selected?.plan.observation_id, token],
    queryFn: () => api.observation(selected!.plan.observation_id, token || undefined),
    enabled: Boolean(selected),
  });
  const protectedScreenshot = useQuery({
    queryKey: ["planning-evidence", selected?.plan.observation_id, token],
    queryFn: () => executionApi.screenshot(selected!.plan.observation_id, token),
    enabled: !!selected && !!token,
    gcTime: 0,
  });
  useEffect(() => {
    if (!protectedScreenshot.data || !selected) return;
    const id = selected.plan.observation_id;
    const url = URL.createObjectURL(protectedScreenshot.data);
    setProtectedImage({ id, url });
    return () => URL.revokeObjectURL(url);
  }, [protectedScreenshot.data, selected]);
  const generate = useMutation({
    mutationFn: () =>
      planningApi.generate(
        chosenId,
        goal,
        constraints
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    onSuccess: async (result) => {
      setSelected(result);
      setInterpreted(null);
      await client.invalidateQueries({ queryKey: ["plans"] });
      await client.invalidateQueries({ queryKey: ["model"] });
    },
  });
  const interpret = useMutation({
    mutationFn: () => planningApi.interpret(chosenId, goal.trim() || undefined),
    onSuccess: (result) => {
      setSelected(null);
      setPreviewLatest(false);
      setSearch({});
      setInterpreted(result);
    },
  });
  const load = useMutation({
    mutationFn: planningApi.get,
    onSuccess: (result) => {
      historyDialog.current?.close();
      setSearch({ plan: result.plan.id });
      setSelected(result);
      setInterpreted(null);
    },
  });
  const validate = useMutation({
    mutationFn: () => planningApi.validate(selected!.plan.id),
    onSuccess: async (result) => {
      setSelected(result);
      await client.invalidateQueries({ queryKey: ["plans"] });
      await client.invalidateQueries({ queryKey: ["plan-events"] });
    },
  });
  const busy =
    generate.isPending ||
    interpret.isPending ||
    load.isPending ||
    validate.isPending ||
    linkedPlan.isLoading;
  const scene = selected?.scene ?? interpreted;
  const screenshotUrl =
    (token && protectedImage?.id === selected?.plan.observation_id ? protectedImage?.url : undefined) ??
    (!token ? selectedObservation.data?.screenshot_url : undefined) ??
    observations.data?.find((o) => o.id === (scene?.observation_id ?? chosenId))
      ?.screenshot_url;
  const error =
    generate.error ??
    interpret.error ??
    load.error ??
    validate.error ??
    linkedPlan.error;
  const canGenerate = callsEnabled && !!chosenId && !!goal.trim() && !busy;
  const resetDraft = () => {
    setGoal("");
    setConstraints("");
    setObservationId("");
    setSelected(null);
    setInterpreted(null);
    setPreviewLatest(false);
    setSearch({});
    hydratedPlan.current = "";
    generate.reset();
    interpret.reset();
  };
  return (
    <div className="studio-workspace">
      <div className="studio-heading">
        <div>
          <div className="studio-title-row">
            <h1>AI Agent Studio</h1>
            <span className="studio-tag studio-cyan-tag">
              PLAN &amp; ORCHESTRATE
            </span>
            <span className="studio-tag studio-gold-tag">
              <ShieldCheck size={12} />
              PLANNING ONLY
            </span>
          </div>
          <p>
            Tell INTI what you want to accomplish — prepare a plan, inspect its
            actions and review every boundary.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => historyDialog.current?.showModal()}
        >
          <History size={15} />
          Recent Syntheses
        </button>
      </div>
      <div className="studio-layout">
        <div className="studio-main">
          <section className="studio-card studio-composer">
            <div className="studio-card-heading">
              <div>
                <span className="health-dot online" aria-hidden="true" />
                <span className="studio-eyebrow">INTI DIRECTIVE PROMPT</span>
                <span className="studio-header-note">/ Task Specification</span>
              </div>
              <button
                className="studio-reset"
                disabled={busy}
                onClick={resetDraft}
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
            <label className="sr-only" htmlFor="planning-goal">
              Natural-language objective
            </label>
            <div className="studio-prompt">
              <textarea
                id="planning-goal"
                placeholder="Describe the objective you want INTI to plan…"
                rows={4}
                maxLength={2000}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === "Enter" &&
                    canGenerate
                  ) {
                    event.preventDefault();
                    generate.mutate();
                  }
                }}
                disabled={busy}
              />
              <div className="studio-prompt-meta">
                <span>
                  TEXT OBJECTIVE <b>·</b> {Array.from(goal).length} characters
                </span>
                <kbd>Ctrl / ⌘ + Enter to prepare</kbd>
              </div>
            </div>
            <div className="studio-parameters">
              <div>
                <span>TARGET APPLICATION</span>
                <strong>INTI synthetic inventory</strong>
              </div>
              <div>
                <span>EXECUTION MODE</span>
                <strong>
                  Plan for review <em>HITL gate</em>
                </strong>
              </div>
              <div>
                <span>SANDBOX BOUNDARY</span>
                <strong>
                  Allowlisted target <ShieldCheck size={13} />
                </strong>
              </div>
            </div>
            <label
              className="studio-observation-label"
              htmlFor="planning-observation"
            >
              Observation
            </label>
            <select
              id="planning-observation"
              value={chosenId}
              onChange={(event) => {
                setObservationId(event.target.value);
                setSelected(null);
                setInterpreted(null);
                setPreviewLatest(false);
                setSearch({});
              }}
              disabled={busy}
            >
              {selected && !observations.data?.some((observation) => observation.id === selected.plan.observation_id) && <option value={selected.plan.observation_id}>Saved plan observation {selected.plan.observation_id.slice(0,8)}</option>}
              {!observations.data?.length && (
                <option value="">Capture an observation first</option>
              )}
              {observations.data?.map((observation) => (
                <option key={observation.id} value={observation.id}>
                  {observation.page_title} ·{" "}
                  {new Date(observation.timestamp).toLocaleString()}
                </option>
              ))}
            </select>
            <details className="studio-constraints">
              <summary>
                Constraints <span>Optional · one per line</span>
              </summary>
              <label className="sr-only" htmlFor="planning-constraints">
                Constraints (one per line, optional)
              </label>
              <textarea
                id="planning-constraints"
                placeholder="Do not change any records."
                maxLength={10000}
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                disabled={busy}
              />
            </details>
            <div className="studio-composer-actions">
              <button
                className="button secondary"
                onClick={() => interpret.mutate()}
                disabled={busy || !chosenId || !callsEnabled}
              >
                Interpret scene
              </button>
              <Link className="studio-inline-link" to="/missions/new?compose=1">
                Authored sandbox task
              </Link>
              <button
                className="button primary"
                onClick={() => generate.mutate()}
                disabled={!canGenerate}
              >
                {generate.isPending ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <BrainCircuit size={17} />
                )}
                Generate Plan
              </button>
            </div>
            {!callsEnabled && (
              <p className="planning-warning">
                {model.data?.configured === false
                  ? "Meta is not configured. "
                  : "Real model calls are disabled or unavailable. "}
                Saved plans remain inspectable. The authored sandbox task is a
                separate, explicitly labeled path without model calls.
              </p>
            )}
            {busy && (
              <p role="status" className="hint">
                {generate.isPending
                  ? "Interpreting screenshot, clarifying intent and validating the proposed plan…"
                  : "Processing request…"}
              </p>
            )}
            {(error || observations.error || capabilities.error) && (
              <p role="alert" className="error">
                {errorMessage(
                  error || observations.error || capabilities.error,
                )}
              </p>
            )}
          </section>
          {selected ? (
            <>
              <PlanTimeline
                plan={selected.plan}
                compact
                onFocus={setFocusedStep}
              />
              <FocusedStep
                action={selected.plan.actions[focusedStep]}
                result={selected}
              />
              <div className="studio-review-bar">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => validate.mutate()}
                >
                  Revalidate plan
                </button>
                <p>
                  Policy and age checks only. This does not approve or execute
                  an action.
                </p>
              </div>
            </>
          ) : (
            <section className="studio-card studio-empty">
              <BrainCircuit size={34} />
              <h2>No plan selected</h2>
              <p>
                Describe an objective and select a screenshot, or open a saved
                plan from Recent Syntheses.
              </p>
              <span className="studio-tag">PERCEIVE → REASON → PLAN</span>
            </section>
          )}
          {scene && screenshotUrl && (
            <details className="studio-evidence">
              <summary>
                Visual evidence &amp; target bounds{" "}
                <span>Captured interface</span>
              </summary>
              <SceneViewer
                key={scene.id}
                scene={scene}
                screenshotUrl={screenshotUrl}
                authored={selected?.model_usage.length === 0}
              />
            </details>
          )}
          {selectedObservation.error && (
            <p className="planning-warning">
              {token ? errorMessage(selectedObservation.error) : (
                <>This saved plan uses protected observation evidence. <Link to="/?connect=1">Connect your local operator</Link> to inspect its captured interface.</>
              )}
            </p>
          )}
          {protectedScreenshot.error && (
            <p className="error" role="alert">{errorMessage(protectedScreenshot.error)}</p>
          )}
          {selected && (
            <details className="studio-evidence">
              <summary>
                Plan metadata &amp; trace{" "}
                <span>Requirements, warnings and provenance</span>
              </summary>
              <PlanInspector result={selected} events={events.data} />
              {events.error && (
                <p className="error" role="alert">
                  {errorMessage(events.error)}
                </p>
              )}
            </details>
          )}
        </div>
        <aside className="studio-aside">
          <StudioPanels
            model={model.data}
            result={selected}
            origin={
              selectedObservation.data?.source_url ??
              observations.data?.find(
                (observation) => observation.id === chosenId,
              )?.source_url
            }
            busy={busy}
            callsEnabled={callsEnabled}
          />
        </aside>
      </div>
      <div className="studio-session-bar">
        <span>
          {selected
            ? `PLAN #${selected.plan.id.slice(0, 8)}`
            : "INSTRUCTION SESSION"}
        </span>
        <p>
          {selected
            ? "Saved plan loaded for inspection. Approval and execution remain separate."
            : "No plan has been prepared. No execution is authorized by this page."}
        </p>
        <Link to="/verification">
          View Verification Lab <ChevronRight size={14} />
        </Link>
      </div>
      <dialog
        className="studio-history-dialog"
        ref={historyDialog}
        aria-labelledby="studio-history-title"
      >
        <div className="studio-card-heading">
          <h2 id="studio-history-title">Recent Syntheses</h2>
          <span className="studio-tag">
            {history.data?.total ?? "—"} SAVED PLANS
          </span>
          <form method="dialog">
            <button
              className="studio-dialog-close"
              aria-label="Close saved plans"
            >
              <X size={17} />
            </button>
          </form>
        </div>
        {history.isPending ? (
          <p role="status">Loading planning history…</p>
        ) : history.error ? (
          <p role="alert" className="error">
            {errorMessage(history.error)}
          </p>
        ) : !history.data.items.length ? (
          <p className="hint">No persisted plans yet.</p>
        ) : (
          <div className="plan-history">
            {history.data.items.map((item) => (
              <button
                key={item.plan.id}
                onClick={() => load.mutate(item.plan.id)}
                disabled={busy}
                className={selected?.plan.id === item.plan.id ? "selected" : ""}
              >
                <b>{item.plan.goal}</b>
                <span className={`plan-status ${item.plan.status}`}>
                  {item.plan.status.replaceAll("_", " ")}
                </span>
                <time>{new Date(item.plan.created_at).toLocaleString()}</time>
              </button>
            ))}
          </div>
        )}
        <div className="history-pagination">
          <button
            className="button secondary"
            disabled={offset === 0 || busy}
            onClick={() => setOffset(Math.max(0, offset - 10))}
          >
            Previous
          </button>
          <button
            className="button secondary"
            disabled={
              !history.data || offset + 10 >= history.data.total || busy
            }
            onClick={() => setOffset(offset + 10)}
          >
            Next
          </button>
        </div>
      </dialog>
    </div>
  );
}
