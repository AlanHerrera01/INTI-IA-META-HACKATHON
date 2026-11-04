import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../../services/api";
import { executionApi } from "../../services/executionApi";

export function RecoveryEvidence({
  id,
  token,
  label,
}: {
  id?: string;
  token: string;
  label: string;
}) {
  const [resource, setResource] = useState<{ blob: Blob; url: string } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const image = useQuery({
    queryKey: ["recovery-image", token, id],
    queryFn: () => executionApi.screenshot(id!, token),
    enabled: !!id && !!token,
    gcTime: 0,
    retry: false,
  });
  const metadata = useQuery({
    queryKey: ["recovery-observation", token, id],
    queryFn: () => api.observation(id!, token),
    enabled: !!id && !!token,
    gcTime: 0,
    retry: false,
  });
  useEffect(() => {
    if (!image.data) return;
    const url = URL.createObjectURL(image.data);
    setResource({ blob: image.data, url });
    return () => URL.revokeObjectURL(url);
  }, [image.data]);
  const src =
    token && resource?.blob === image.data ? resource?.url : undefined;
  return (
    <section className="recovery-evidence" aria-label={label}>
      <header>
        <span className="recovery-dot" />
        <h3>{label}</h3>
        <small>{id ? "RECORDED PNG" : "NO CAPTURE"}</small>
      </header>
      <div className="recovery-evidence-canvas">
        {image.error || failed ? (
          <p role="alert" className="execution-error">
            {image.error
              ? errorMessage(image.error)
              : "Screenshot could not be loaded."}
          </p>
        ) : src ? (
          <img src={src} alt={label} onError={() => setFailed(true)} />
        ) : (
          <div className="recovery-evidence-empty">
            <Camera size={30} />
            <p>
              {id && token
                ? "Loading protected screenshot…"
                : "No observation captured for this case."}
            </p>
            <small>Evidence appears only after a recorded recovery.</small>
          </div>
        )}
      </div>
      <div className="recovery-evidence-caption">
        <span>
          {metadata.data
            ? new Date(metadata.data.timestamp).toLocaleString()
            : "Capture time unavailable"}
        </span>
        <code>{id || "No observation reference"}</code>
      </div>
      {metadata.error && (
        <p className="recovery-small-note">
          Frame metadata: {errorMessage(metadata.error)}
        </p>
      )}
      {id && (
        <div className="recovery-evidence-links">
          <Link to={`/observations/${id}`}>Inspect observation →</Link>
          {src && !image.error && !failed && (
            <a href={src} download={`inti-recovery-${id}.png`}>
              <Download size={12} />
              Frame
            </a>
          )}
        </div>
      )}
    </section>
  );
}
