import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Download, Expand, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../services/api";
import { executionApi } from "../../services/executionApi";
import { terminal, type ExecutionBundle } from "../../types/execution";

export function ExecutionBrowser({
  bundle,
  token,
}: {
  bundle: ExecutionBundle;
  token: string;
}) {
  const id = bundle.session.latest_observation_id;
  const [image, setImage] = useState<{
    blob: Blob;
    id: string;
    url: string;
  } | null>(null);
  const [overlay, setOverlay] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  const failed = !!id && failedId === id;
  const screenshot = useQuery({
    queryKey: ["execution-screenshot", token, id],
    queryFn: () => executionApi.screenshot(id!, token),
    enabled: !!id && !!token,
    gcTime: 0,
  });
  const observation = useQuery({
    queryKey: ["execution-observation", token, id],
    queryFn: () => api.observation(id!, token),
    enabled: !!id && !!token,
    gcTime: 0,
  });
  useEffect(() => {
    if (!screenshot.data || !id) return;
    const url = URL.createObjectURL(screenshot.data);
    setImage({ blob: screenshot.data, id, url });
    return () => URL.revokeObjectURL(url);
  }, [screenshot.data, id]);
  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);
  const source =
    token && image?.id === id && image.blob === screenshot.data
      ? image.url
      : undefined;
  const viewport = observation.data
    ? { width: observation.data.width, height: observation.data.height }
    : bundle.manifest.viewport;
  const result = bundle.results.find(
    (item) => item.before_observation_id === id,
  );
  const box = result?.resolution?.bounding_box;
  const scale =
    box?.coordinate_system === "normalized_1000"
      ? { width: 1000, height: 1000 }
      : viewport;
  const validBox =
    box &&
    observation.data &&
    viewport.width === bundle.manifest.viewport.width &&
    viewport.height === bundle.manifest.viewport.height &&
    [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= scale.width &&
    box.y + box.height <= scale.height;
  return (
    <section
      className={`live-browser ${expanded ? "live-browser-expanded" : ""}`}
      aria-label="Execution browser"
    >
      <div className="live-browser-chrome">
        <span className="live-traffic" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>
          {observation.data?.source_url ||
            bundle.browser_session?.current_url ||
            bundle.manifest.initial_url}
        </span>
        <small>{bundle.browser_session?.status || "NOT OPENED"}</small>
      </div>
      <div className="live-browser-toolbar">
        <div role="group" aria-label="Browser display">
          <button
            aria-pressed={!overlay || !validBox}
            onClick={() => setOverlay(false)}
          >
            Raw Viewport
          </button>
          <button
            aria-pressed={overlay && !!validBox}
            disabled={!validBox}
            onClick={() => setOverlay(true)}
          >
            <ScanLine size={13} />
            Recorded Target
          </button>
        </div>
        <button aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>
          <Expand size={13} />
          {expanded ? "Fit to viewport" : "Expand"}
        </button>
      </div>
      <div className="live-browser-stage">
        {failed || screenshot.error ? (
          <p role="alert" className="execution-error">
            {screenshot.error
              ? errorMessage(screenshot.error)
              : "Screenshot could not be loaded."}
          </p>
        ) : source ? (
          <div className="live-browser-image">
            <img
              src={source}
              alt="Latest execution browser observation"
              onError={() => setFailedId(id)}
            />
            {overlay && validBox && box && (
              <span
                className="execution-target"
                style={{
                  left: `${(box.x / scale.width) * 100}%`,
                  top: `${(box.y / scale.height) * 100}%`,
                  width: `${(box.width / scale.width) * 100}%`,
                  height: `${(box.height / scale.height) * 100}%`,
                }}
              >
                <small>RECORDED TARGET</small>
              </span>
            )}
          </div>
        ) : (
          <div className="live-browser-wait">
            <Camera size={34} />
            <p>
              {id
                ? "Loading protected screenshot…"
                : "A screenshot will appear after the browser opens."}
            </p>
          </div>
        )}
      </div>
      <div className="live-browser-caption">
        <span className="live-frame-state">
          <i />
          {terminal.has(bundle.session.status)
            ? "SAVED FRAME"
            : "LATEST CAPTURE"}
        </span>
        <span>
          {observation.data
            ? new Date(observation.data.timestamp).toLocaleString()
            : "No observation yet"}
        </span>
        <small>
          {viewport.width} × {viewport.height}
        </small>
      </div>
      {observation.error && (
        <p className="execution-error" role="alert">
          Frame metadata: {errorMessage(observation.error)}
        </p>
      )}
      <div className="live-browser-footer">
        <p>
          Recorded pixels. FPS, frame latency and grounding confidence are not
          measured.
        </p>
        {source && !failed && (
          <a href={source} download={`inti-execution-${bundle.session.id}.png`}>
            <Download size={13} />
            Frame Snap
          </a>
        )}
        {id && <Link to={`/observations/${id}`}>Inspect observation →</Link>}
      </div>
    </section>
  );
}
