import { Activity, BrainCircuit, Monitor, Database } from "lucide-react";
import { Status } from "../../components/Status";
import { useModel, useSystem } from "../../hooks/useSystem";
import { errorMessage } from "../../services/api";

export function SystemCards() {
  const system = useSystem();
  const model = useModel();
  const cards = [
    {
      title: "Backend",
      icon: Activity,
      value: system.data?.backend,
      note: system.data
        ? `FastAPI · v${system.data.version}`
        : "Waiting for backend",
      pending: system.isPending,
    },
    {
      title: "Meta model",
      icon: BrainCircuit,
      value: model.data?.configured,
      note: model.data?.model ?? "Waiting for configuration",
      pending: model.isPending,
    },
    {
      title: "Browser engine",
      icon: Monitor,
      value: system.data?.browser,
      note: "Playwright · Chromium",
      pending: system.isPending,
    },
    {
      title: "Observation store",
      icon: Database,
      value: system.data?.database,
      note: "PostgreSQL · Metadata",
      pending: system.isPending,
    },
  ];
  return (
    <>
      <div className="status-grid">
        {cards.map(({ title, icon: Icon, value, note, pending }) => (
          <article className="stat-card" key={title}>
            <div className="stat-title">
              <span>{title}</span>
              <Icon size={18} />
            </div>
            <Status
              value={value}
              pending={pending}
              yes={title === "Meta model" ? "Configured" : "Available"}
              no={title === "Meta model" ? "Not configured" : "Unavailable"}
            />
            <p>{note}</p>
          </article>
        ))}
      </div>
      {(system.isError || model.isError) && (
        <div role="alert" className="error">
          {errorMessage(system.error ?? model.error)}
        </div>
      )}
    </>
  );
}
