import { useModel, useSystem } from "../hooks/useSystem";
import { Status } from "../components/Status";
import { SystemCards } from "../features/system/SystemCards";

export function SystemPage() {
  const system = useSystem();
  const model = useModel();
  return (
    <>
      <div className="eyebrow">WORKSPACE / DIAGNOSTICS</div>
      <h1>
        System status<span className="gold-dot">.</span>
      </h1>
      <p className="subtle page-subtitle">
        Live dependency checks from the INTI backend.
      </p>
      <SystemCards />
      <section className="panel padded">
        <h2>Environment readiness</h2>
        <dl className="system-list">
          <div>
            <dt>Observation readiness</dt>
            <dd>
              <Status
                value={system.data?.ready}
                pending={system.isPending}
                yes="Ready"
                no="Degraded"
              />
            </dd>
          </div>
          <div>
            <dt>Application version</dt>
            <dd>{system.data?.version ?? "Waiting for backend"}</dd>
          </div>
          <div>
            <dt>Meta configuration</dt>
            <dd>
              <Status
                value={model.data?.configured}
                pending={model.isPending}
                yes="Configured"
                no="Not configured"
              />
            </dd>
          </div>
          <div>
            <dt>Meta availability</dt>
            <dd>
              <Status value={model.data?.available} pending={model.isPending} />
            </dd>
          </div>
          <div>
            <dt>Model identifier</dt>
            <dd className="mono">{model.data?.model ?? "Unknown"}</dd>
          </div>
        </dl>
        <p className="hint">{model.data?.detail}</p>
        <button
          className="button secondary"
          disabled={system.isFetching || model.isFetching}
          onClick={() => {
            void system.refetch();
            void model.refetch();
          }}
        >
          Refresh diagnostics
        </button>
      </section>
    </>
  );
}
