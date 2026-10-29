import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, LoaderCircle, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "../services/api";
import { planningApi } from "../services/planningApi";
import { useModel } from "../hooks/useSystem";
import { SceneViewer } from "../features/planning/SceneViewer";
import { PlanTimeline } from "../features/planning/PlanTimeline";
import { PlanInspector } from "../features/planning/PlanInspector";
import type { PlanningResult, VisualScene } from "../types/planning";

export function PlanningPage() {
  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [observationId, setObservationId] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PlanningResult | null>(null);
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
  const chosenId = observationId || observations.data?.[0]?.id || "";
  const activeId = selected?.plan.id;
  const events = useQuery({
    queryKey: ["plan-events", activeId],
    queryFn: () => planningApi.events(activeId!),
    enabled: Boolean(activeId),
  });
  const selectedObservation = useQuery({
    queryKey: ["observations", selected?.plan.observation_id],
    queryFn: () => api.observation(selected!.plan.observation_id),
    enabled: Boolean(selected),
  });
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
      setInterpreted(result);
    },
  });
  const load = useMutation({
    mutationFn: planningApi.get,
    onSuccess: (result) => {
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
    validate.isPending;
  const scene = selected?.scene ?? interpreted;
  const screenshotUrl =
    selectedObservation.data?.screenshot_url ??
    observations.data?.find((o) => o.id === (scene?.observation_id ?? chosenId))
      ?.screenshot_url;
  const error =
    generate.error ?? interpret.error ?? load.error ?? validate.error;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REASONING WORKSPACE / PHASE 02</div>
          <h1>
            AI Planning<span className="gold-dot">.</span>
          </h1>
          <p>
            Turn observed interfaces into inspectable plans. Every uncertainty
            stays visible.
          </p>
        </div>
        <span className="planning-only">
          <ShieldCheck size={15} /> PLANNING ONLY
        </span>
      </div>
      <div className="planning-layout">
        <div className="planning-main">
          <section className="panel padded task-input">
            <h2>Define the objective</h2>
            <label htmlFor="planning-observation">Observation</label>
            <select
              id="planning-observation"
              value={chosenId}
              onChange={(e) => {
                setObservationId(e.target.value);
                setInterpreted(null);
                setSelected(null);
              }}
              disabled={busy}
            >
              {!observations.data?.length && (
                <option value="">Capture an observation first</option>
              )}
              {observations.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.page_title} · {new Date(o.timestamp).toLocaleString()}
                </option>
              ))}
            </select>
            <label htmlFor="planning-goal">Natural-language objective</label>
            <textarea
              id="planning-goal"
              placeholder="Find asset EQ-001 and prepare a plan to inspect its current status."
              maxLength={2000}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={busy}
            />
            <label htmlFor="planning-constraints">
              Constraints{" "}
              <span className="subtle">(one per line, optional)</span>
            </label>
            <textarea
              id="planning-constraints"
              placeholder="Do not change any records."
              maxLength={10000}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              disabled={busy}
            />
            <div className="planning-buttons">
              <button
                className="button primary"
                onClick={() => generate.mutate()}
                disabled={
                  busy ||
                  !chosenId ||
                  !goal.trim() ||
                  model.data?.configured === false
                }
              >
                {generate.isPending ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <BrainCircuit size={16} />
                )}
                Generate Plan
              </button>
              <button
                className="button secondary"
                onClick={() => interpret.mutate()}
                disabled={busy || !chosenId || model.data?.configured === false}
              >
                Interpret scene
              </button>
            </div>
            {model.data?.configured === false && (
              <p className="planning-warning">
                Meta is not configured. Add a valid API key to enable real
                visual reasoning and planning.
              </p>
            )}
            {busy && (
              <p role="status" className="hint">
                {generate.isPending
                  ? "Interpreting screenshot, clarifying intent and validating the proposed plan…"
                  : "Processing request…"}
              </p>
            )}
            {error && (
              <p role="alert" className="error">
                {errorMessage(error)}
              </p>
            )}
            {observations.isError && (
              <p role="alert" className="error">
                {errorMessage(observations.error)}
              </p>
            )}
          </section>
          {scene && screenshotUrl ? (
            <SceneViewer
              key={scene.id}
              scene={scene}
              screenshotUrl={screenshotUrl}
            />
          ) : (
            !selected &&
            !interpreted && (
              <section className="panel planning-empty">
                <BrainCircuit size={32} />
                <h2>No plan selected</h2>
                <p>
                  Select a screenshot and describe an objective, or open an
                  existing plan from history.
                </p>
                <span className="mono">PERCEIVE → REASON → PLAN</span>
              </section>
            )
          )}
          {selected && (
            <>
              <div className="revalidate-row">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => validate.mutate()}
                >
                  Revalidate plan
                </button>
                <span className="hint">
                  Revalidation checks policy and age. It does not capture or
                  execute anything.
                </span>
              </div>
              <PlanTimeline plan={selected.plan} />
            </>
          )}
        </div>
        <aside className="planning-aside">
          <section className="panel padded plan-history">
            <div className="planning-section-title">
              <h2>Plan history</h2>
              <span className="mono subtle">
                {history.data?.total ?? "—"} records
              </span>
            </div>
            {history.isPending ? (
              <p role="status" className="hint">
                Loading planning history…
              </p>
            ) : history.isError ? (
              <p role="alert" className="error">
                {errorMessage(history.error)}
              </p>
            ) : history.data.items.length === 0 ? (
              <p className="hint">No persisted plans yet.</p>
            ) : (
              history.data.items.map((item) => (
                <button
                  type="button"
                  key={item.plan.id}
                  onClick={() => load.mutate(item.plan.id)}
                  disabled={busy}
                  className={
                    selected?.plan.id === item.plan.id ? "selected" : ""
                  }
                >
                  <b>{item.plan.goal}</b>
                  <span className={`plan-status ${item.plan.status}`}>
                    {item.plan.status.replaceAll("_", " ")}
                  </span>
                  <time>{new Date(item.plan.created_at).toLocaleString()}</time>
                </button>
              ))
            )}
            <div className="history-pagination">
              <button
                className="button secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 10))}
              >
                Previous
              </button>
              <button
                className="button secondary"
                disabled={!history.data || offset + 10 >= history.data.total}
                onClick={() => setOffset(offset + 10)}
              >
                Next
              </button>
            </div>
          </section>
          {selected && (
            <>
              <PlanInspector result={selected} events={events.data} />
              {events.isError && (
                <p className="error" role="alert">
                  {errorMessage(events.error)}
                </p>
              )}
            </>
          )}
        </aside>
      </div>
    </>
  );
}
