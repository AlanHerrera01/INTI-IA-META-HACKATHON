import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Camera,
  ChevronRight,
  Eye,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../services/api";
import { SystemCards } from "../features/system/SystemCards";
import { ObservationViewer } from "../features/observations/ObservationViewer";

export function Dashboard({
  observationsPage = false,
}: {
  observationsPage?: boolean;
}) {
  const query = useQuery({
    queryKey: ["observations"],
    queryFn: api.observations,
  });
  const client = useQueryClient();
  const capture = useMutation({
    mutationFn: api.capture,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["observations"] });
      await client.invalidateQueries({ queryKey: ["system"] });
    },
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            INTELLIGENCE WORKSPACE <span>/</span> CAPTURED EVIDENCE
          </div>
          <h1>
            {observationsPage ? "Visual Observations" : "Observation console"}
            <span className="gold-dot">.</span>
          </h1>
          <p>See the interface. Understand the state. Build the next move.</p>
        </div>
        <button
          className="button primary"
          disabled={capture.isPending}
          onClick={() => capture.mutate()}
        >
          {capture.isPending ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Camera size={17} />
          )}
          {capture.isPending ? "Capturing…" : "Capture observation"}
        </button>
      </div>
      <SystemCards />
      <div className="pipeline">
        <div className="pipeline-label">THE INTI LOOP</div>
        {["Perceive", "Reason", "Act", "Verify", "Recover"].map(
          (step, index) => (
            <div
              key={step}
              className={`pipeline-step ${index === 0 ? "active" : ""}`}
            >
              <span className="step-number">0{index + 1}</span>
              {step}
              {index < 4 && <ChevronRight size={14} />}
            </div>
          ),
        )}
        <span className="phase-label">Observation foundation</span>
      </div>
      {capture.isError && (
        <div role="alert" className="error">
          {errorMessage(capture.error)}
        </div>
      )}
      {capture.isPending && (
        <p className="capture-progress" role="status">
          <LoaderCircle className="spin" size={16} /> Opening the authorized
          demo and capturing the viewport…
        </p>
      )}
      <section className="panel">
        <header className="panel-header">
          <div>
            <Eye size={18} />
            <h2>
              {observationsPage ? "Observation viewer" : "Latest observation"}
            </h2>
          </div>
          <span className="mono subtle">
            {query.data?.[0] ? "CAPTURED / BROWSER" : "LOCAL SANDBOX"}
          </span>
        </header>
        {query.isPending ? (
          <div className="empty-state" role="status">
            <LoaderCircle className="spin" /> Loading observations…
          </div>
        ) : query.isError ? (
          <div className="empty-state">
            <p className="error" role="alert">
              {errorMessage(query.error)}
            </p>
            <button
              className="button secondary"
              onClick={() => {
                void query.refetch();
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <ObservationViewer
            key={query.data[0]?.id ?? "empty"}
            observation={query.data[0]}
          />
        )}
      </section>
      {observationsPage && query.data && query.data.length > 0 && (
        <section className="capture-gallery-section">
          <div className="mission-section-title">
            <h2>Recent captures</h2>
            <span className="workspace-tag">
              {Math.min(query.data.length, 8)} recent observations
            </span>
          </div>
          <div className="capture-gallery">
            {query.data.slice(0, 8).map((item) => (
              <Link
                className="capture-card"
                key={item.id}
                to={`/observations/${item.id}`}
              >
                <div className="capture-thumbnail">
                  <img
                    loading="lazy"
                    src={item.screenshot_url}
                    alt={`Saved observation: ${item.page_title}`}
                  />
                  <span className="workspace-tag">
                    {item.width} ? {item.height}
                  </span>
                </div>
                <div className="capture-card-copy">
                  <strong>{item.page_title}</strong>
                  <time dateTime={item.timestamp}>
                    {new Date(item.timestamp).toLocaleString()}
                  </time>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="sandbox-note">
        <ShieldCheck size={17} />
        <span>Authorized local environment</span>
        <span className="subtle">
          Only allowlisted demo URLs can be observed. Capturing an observation
          does not authorize an action.
        </span>
      </div>
    </>
  );
}
