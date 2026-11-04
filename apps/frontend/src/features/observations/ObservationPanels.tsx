import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Crosshair, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../services/api";
import { useModel } from "../../hooks/useSystem";
import type { Observation } from "../../types/api";
import type { PlanningResult, VisualScene } from "../../types/planning";

export function ObservationPanels({
  observation,
  scene,
  plan,
  focused,
  onFocus,
  token,
}: {
  observation?: Observation;
  scene?: VisualScene;
  plan?: PlanningResult;
  focused: string;
  onFocus: (id: string) => void;
  token: string;
}) {
  const [instruction, setInstruction] = useState(
    "Identify the visible controls and describe the inventory state.",
  );
  const model = useModel();
  const capabilities = useQuery({
    queryKey: ["capabilities"],
    queryFn: api.capabilities,
  });
  const client = useQueryClient();
  const analysis = useMutation({
    mutationFn: () =>
      api.analyze(observation!.id, instruction.trim(), token || undefined),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["observations"] });
      await client.invalidateQueries({ queryKey: ["observation-detail"] });
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["model"] });
    },
  });
  const recorded = analysis.data ?? observation?.analysis;
  const elements = scene?.elements ?? [];
  const canAnalyze =
    model.data?.configured === true &&
    model.data.available !== false &&
    capabilities.data?.model_calls_enabled === true;
  return (
    <>
      <section className="observation-panel" aria-label="Viewport telemetry">
        <div className="observation-panel-heading">
          <h2>VIEWPORT TELEMETRY</h2>
          <span className="observation-small-tag">
            {observation ? "RECORDED" : "NO FRAME"}
          </span>
        </div>
        <div className="observation-telemetry-grid">
          <div>
            <small>RESOLUTION</small>
            <strong>
              {observation
                ? `${observation.width} × ${observation.height}`
                : "Unavailable"}
            </strong>
            <span>Native captured viewport</span>
          </div>
          <div>
            <small>CAPTURE MODE</small>
            <strong>Still frame</strong>
            <span>FPS and latency not measured</span>
          </div>
        </div>
        {observation && (
          <time
            dateTime={observation.timestamp}
            className="observation-captured-at"
          >
            Captured {new Date(observation.timestamp).toLocaleString()}
          </time>
        )}
      </section>
      <section className="observation-panel" aria-label="Recorded UI elements">
        <div className="observation-panel-heading">
          <h2>
            RECORDED UI ELEMENTS <span>{elements.length} items</span>
          </h2>
          <Crosshair size={15} />
        </div>
        {!elements.length && (
          <div className="observation-panel-empty">
            <ScanLine size={26} />
            <p>
              No structured elements recorded for this frame in the loaded
              plans.
            </p>
            {observation?.analysis?.elements.length ? (
              <ul>
                {observation.analysis.elements.map((element, index) => (
                  <li key={index}>{element}</li>
                ))}
              </ul>
            ) : (
              <small>Capture pixels do not imply detected targets.</small>
            )}
          </div>
        )}
        <div className="observation-element-list">
          {elements.map((element) => (
            <button
              key={element.id}
              aria-pressed={focused === element.id}
              onClick={() => onFocus(element.id)}
            >
              <span className={`observation-element-icon ${element.source}`}>
                <Crosshair size={17} />
              </span>
              <div>
                <strong>{element.label || element.id}</strong>
                <small>
                  {element.element_type} · {element.source.replaceAll("_", " ")}
                </small>
                <p>
                  {element.bounding_box
                    ? `[${element.bounding_box.x}, ${element.bounding_box.y}, ${element.bounding_box.width}, ${element.bounding_box.height}] ${element.bounding_box.coordinate_system}`
                    : "No recorded bounds"}
                </p>
              </div>
              <span className="observation-element-confidence">
                {element.source === "model_visual" &&
                element.confidence_optional !== null &&
                Number.isFinite(element.confidence_optional) &&
                element.confidence_optional >= 0 &&
                element.confidence_optional <= 1
                  ? `${(element.confidence_optional * 100).toFixed(1)}% estimate`
                  : element.visible
                    ? "VISIBLE"
                    : "NOT VISIBLE"}
              </span>
            </button>
          ))}
        </div>
        {!!elements.length && (
          <p className="observation-panel-footnote">
            Recorded estimates, not a live detection stream. Selecting a target
            only inspects it.
          </p>
        )}
      </section>
      <section className="observation-panel" aria-label="Perception record">
        <div className="observation-panel-heading">
          <h2>
            <BrainCircuit size={15} />
            PERCEPTION RECORD
          </h2>
          <span className="observation-small-tag">
            {recorded ? "MODEL OUTPUT" : scene ? "SAVED PLAN" : "RAW CAPTURE"}
          </span>
        </div>
        <div className="observation-reasoning-copy">
          <p>
            {recorded?.summary ??
              scene?.summary ??
              "This frame has no recorded interpretation. Inspect the original pixels or open AI Agent Studio to review a plan."}
          </p>
          {recorded && (
            <>
              <strong>{recorded.model}</strong>
              <p>{recorded.ui_state}</p>
            </>
          )}
          {scene && (
            <p className="observation-panel-footnote">
              {scene.model_usage
                ? `Recorded model: ${scene.model_usage.model}`
                : "Authored plan evidence. No model inference recorded."}
            </p>
          )}
          {!!scene?.uncertainties.length && (
            <ul>
              {scene.uncertainties.map((uncertainty, index) => (
                <li key={index}>{uncertainty}</li>
              ))}
            </ul>
          )}
          <dl className="observation-provenance">
            <div>
              <dt>Token usage</dt>
              <dd>
                {scene?.model_usage &&
                scene.model_usage.input_tokens !== null &&
                scene.model_usage.output_tokens !== null
                  ? `${scene.model_usage.input_tokens} in / ${scene.model_usage.output_tokens} out`
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt>Segmentation mask</dt>
              <dd>Not available</dd>
            </div>
          </dl>
        </div>
        <Link
          className="observation-plan-link"
          to={plan ? `/planning?plan=${plan.plan.id}` : "/planning"}
        >
          {plan ? "Inspect associated plan" : "Open AI Agent Studio"} →
        </Link>
        <details className="observation-analysis-controls">
          <summary>Model interpretation</summary>
          <label htmlFor="observation-instruction">Instruction</label>
          <textarea
            id="observation-instruction"
            maxLength={2000}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <button
            className="button secondary"
            disabled={
              !observation ||
              !canAnalyze ||
              !instruction.trim() ||
              analysis.isPending
            }
            onClick={() => analysis.mutate()}
          >
            {analysis.isPending ? "Interpreting…" : "Analyze with Meta"}
          </button>
          {!canAnalyze && (
            <p className="observation-panel-footnote">
              Real model calls are disabled or unavailable. Saved evidence
              remains inspectable.
            </p>
          )}
          {analysis.error && (
            <p className="error" role="alert">
              {errorMessage(analysis.error)}
            </p>
          )}
        </details>
      </section>
    </>
  );
}
