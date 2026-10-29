import { useState } from "react";
import type { VisualScene } from "../../types/planning";

export function SceneViewer({
  scene,
  screenshotUrl,
}: {
  scene: VisualScene;
  screenshotUrl: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <section className="panel padded scene-panel">
      <div className="planning-section-title">
        <h2>Visual scene</h2>
        <span className="phase-badge">SCREENSHOT ONLY</span>
      </div>
      <p className="hint">{scene.summary}</p>
      <div className="scene-image">
        <img
          src={screenshotUrl}
          alt="Screenshot with model-estimated element bounds"
        />
        {scene.elements
          .filter((e) => e.bounding_box && e.visible)
          .map((element) => {
            const box = element.bounding_box!;
            const xScale =
              box.coordinate_system === "pixels" ? scene.viewport.width : 1000;
            const yScale =
              box.coordinate_system === "pixels" ? scene.viewport.height : 1000;
            return (
              <button
                key={element.id}
                type="button"
                className={`element-overlay ${selected === element.id ? "selected" : ""}`}
                aria-label={`Inspect ${element.label || element.id}`}
                title={`${element.label} · ${element.source}`}
                style={{
                  left: `${(box.x / xScale) * 100}%`,
                  top: `${(box.y / yScale) * 100}%`,
                  width: `${(box.width / xScale) * 100}%`,
                  height: `${(box.height / yScale) * 100}%`,
                }}
                onClick={() => setSelected(element.id)}
              >
                <span>{element.id}</span>
              </button>
            );
          })}
      </div>
      <p className="hint">
        Bounds are model estimates. Coordinate validity does not establish
        localization accuracy.
      </p>
      <div className="element-list" aria-label="Detected elements">
        {scene.elements.map((element) => (
          <button
            type="button"
            key={element.id}
            onClick={() => setSelected(element.id)}
            className={selected === element.id ? "selected" : ""}
          >
            <div>
              <b>{element.label || element.id}</b>
              <span className="mono">{element.element_type}</span>
            </div>
            <p>{element.description}</p>
            <span className="provenance">{element.source}</span>
            <span className="hint">
              {" "}
              · {element.visible ? "Visible" : "Not visible"} ·{" "}
              {element.enabled === null
                ? "Enabled state unknown"
                : element.enabled
                  ? "Enabled"
                  : "Disabled"}{" "}
              ·{" "}
              {element.confidence_optional === null
                ? "Confidence unavailable"
                : `Model confidence ${Math.round(element.confidence_optional * 100)}%`}
            </span>
          </button>
        ))}
      </div>
      {scene.uncertainties.length > 0 && (
        <div className="planning-warning">
          <h3>Scene uncertainties</h3>
          <ul>
            {scene.uncertainties.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
