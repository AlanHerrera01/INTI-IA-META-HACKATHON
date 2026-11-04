import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppWindow, Search } from "lucide-react";
import {
  computerApi,
  type ComputerDevice,
  type ComputerTask,
} from "../services/computerApi";
import { errorMessage } from "../services/api";
import { useLocale } from "../i18n/useLocale";

export function ComputerApplications({
  token,
  devices,
  targetId,
  onTarget,
  onPrepared,
}: {
  token: string;
  devices: ComputerDevice[];
  targetId: string;
  onTarget: (id: string) => void;
  onPrepared: (task: ComputerTask) => void;
}) {
  const { t, dateLocale } = useLocale();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["computer-applications", token, targetId],
    queryFn: () => computerApi.applications(token, targetId),
    enabled: !!token && !!targetId,
    refetchInterval: 5000,
    retry: false,
  });
  const data = token && !query.isError ? query.data : undefined;
  const target = devices.find((device) => device.id === targetId);
  const fresh = !!data?.scanned_at && Date.now() / 1000 - data.scanned_at < 90;
  const ready = fresh && !!target && Date.now() / 1000 - target.last_seen < 30;
  const apps =
    data?.applications.filter((app) =>
      `${app.name} ${app.path}`.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  const work = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await query.refetch();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="computer-card computer-applications"
      aria-label={t("Applications on this computer")}
    >
      <header>
        <AppWindow size={19} />
        <h2>{t("Applications on this computer")}</h2>
      </header>
      <p className="computer-note">
        {t(
          "Choose which detected desktop applications INTI may open. Each launch still requires an exact plan approval. This does not grant control inside the application.",
        )}
      </p>
      <div className="computer-form-row">
        <label>
          {t("Computer")}
          <select
            aria-label={t("Application computer")}
            value={targetId}
            onChange={(event) => onTarget(event.target.value)}
          >
            {!targetId && (
              <option value="">{t("Pair a Windows agent first")}</option>
            )}
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Search size={13} /> {t("Search applications")}
          <input
            aria-label={t("Search applications")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      {data?.scanned_at && (
        <p className="computer-note">
          {t("Last scan")}:{" "}
          {new Date(data.scanned_at * 1000).toLocaleString(dateLocale)}
        </p>
      )}
      {!ready && (
        <p className="computer-note">
          {t(
            "Connect the updated Windows agent to load a fresh application catalog.",
          )}
        </p>
      )}
      {(error || query.isError) && (
        <p role="alert" className="computer-error">
          {t(error || errorMessage(query.error))}
        </p>
      )}
      <div className="computer-app-list">
        {apps.map((app) => (
          <article key={app.id}>
            <AppWindow size={23} aria-hidden="true" />
            <div>
              <h3>{app.name}</h3>
              <code>{app.path}</code>
              <span className="computer-tag">
                {t(app.allowed ? "Authorized application" : "Not authorized")}
              </span>
            </div>
            <div className="computer-app-actions">
              <button
                disabled={busy || !data || (!app.allowed && !ready)}
                onClick={() => {
                  const prompt = t(
                    app.allowed
                      ? "Remove permission and cancel pending launches?"
                      : "Allow INTI to prepare launches for this application?",
                  );
                  if (window.confirm(`${prompt}\n\n${app.name}\n${app.path}`))
                    void work(async () => {
                      await computerApi.permitApplication(
                        token,
                        targetId,
                        app,
                        !app.allowed,
                      );
                    });
                }}
              >
                {t(app.allowed ? "Remove permission" : "Authorize application")}
              </button>
              <button
                className="computer-primary"
                disabled={busy || !data || !ready || !app.allowed}
                onClick={() =>
                  void work(async () => {
                    const task = await computerApi.prepareApplication(
                      token,
                      targetId,
                      app,
                    );
                    onPrepared(task);
                  })
                }
              >
                {t("Prepare application launch")}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!apps.length && (
        <p className="computer-empty">
          {t(
            "No compatible applications found. Update the agent or adjust your search.",
          )}
        </p>
      )}
      <p className="computer-note">
        {t(
          "Only detected local .exe applications without shortcut arguments are supported. Store apps, console tools and shortcuts requiring arguments are excluded.",
        )}
      </p>
    </section>
  );
}
