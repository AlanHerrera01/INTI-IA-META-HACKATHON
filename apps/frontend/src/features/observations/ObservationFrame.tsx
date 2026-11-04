import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Expand, ScanLine } from "lucide-react";
import { executionApi } from "../../services/executionApi";
import { errorMessage } from "../../services/api";
import { percentBounds } from "./bounds";
import type { Observation } from "../../types/api";
import type { VisualScene } from "../../types/planning";

export function ObservationFrame({
  observation,
  scene,
  token,
  protectedFrame = false,
  boxes,
  focused,
  onFocus,
  thumbnail = false,
}: {
  observation: Observation;
  scene?: VisualScene;
  token: string;
  protectedFrame?: boolean;
  boxes?: boolean;
  focused?: string;
  onFocus?: (id: string) => void;
  thumbnail?: boolean;
}) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const screenshot = useQuery({
    queryKey: ["observation-image", observation.id, token],
    queryFn: () => executionApi.screenshot(observation.id, token),
    enabled: protectedFrame && !!token,
    gcTime: 0,
  });
  useEffect(() => {
    if (!screenshot.data) return;
    const url = URL.createObjectURL(screenshot.data);
    setImage({ blob: screenshot.data, url });
    return () => URL.revokeObjectURL(url);
  }, [screenshot.data]);
  const src = protectedFrame
    ? token && image?.blob === screenshot.data
      ? image?.url
      : undefined
    : observation.screenshot_url;
  const error = screenshot.error
    ? errorMessage(screenshot.error)
    : failed
      ? "Screenshot could not be loaded. Refresh or select another observation."
      : null;
  return (
    <div
      className={`observation-frame ${thumbnail ? "observation-thumbnail" : ""} ${expanded ? "frame-expanded" : ""}`}
    >
      {!thumbnail && (
        <div className="observation-browser-bar">
          <span className="observation-traffic" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span title={observation.source_url}>{observation.source_url}</span>
          <small>RECORDED FRAME</small>
        </div>
      )}
      {error ? (
        <p className="error padded" role="alert">
          {error}
        </p>
      ) : src ? (
        <div
          className="observation-canvas"
          style={{
            aspectRatio: `${observation.width} / ${observation.height}`,
          }}
        >
          <img
            src={src}
            alt={
              thumbnail
                ? `Preview: ${observation.page_title}`
                : `Captured ${observation.page_title}`
            }
            loading={thumbnail ? "lazy" : "eager"}
            onError={() => setFailed(true)}
          />
          {!thumbnail &&
            boxes &&
            scene?.elements.map((element) => {
              const bounds = percentBounds(element, scene, observation);
              if (!bounds) return null;
              return (
                <button
                  key={element.id}
                  type="button"
                  style={bounds}
                  className={`observation-bound ${focused === element.id ? "focused" : ""}`}
                  aria-label={`Inspect target ${element.label || element.id}`}
                  aria-pressed={focused === element.id}
                  onClick={() => onFocus?.(element.id)}
                >
                  <span>
                    {element.element_type} / {element.label || element.id}
                  </span>
                </button>
              );
            })}
        </div>
      ) : (
        <div className="observation-frame-empty" role="status">
          <ScanLine size={25} />
          {token
            ? "Loading protected frame…"
            : "Connect operator to view this frame."}
        </div>
      )}
      {!thumbnail && (
        <div className="observation-frame-tools">
          <span>
            {observation.width} × {observation.height}{" "}
            <small> / recorded viewport</small>
          </span>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-pressed={expanded}
          >
            <Expand size={14} />
            {expanded ? "Fit to viewport" : "Expand frame"}
          </button>
          {src && !error && (
            <a href={src} download={`inti-observation-${observation.id}.png`}>
              <Download size={14} />
              Export Frame
            </a>
          )}
        </div>
      )}
    </div>
  );
}
