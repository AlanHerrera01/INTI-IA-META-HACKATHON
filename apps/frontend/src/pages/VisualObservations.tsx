import { useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Grid2X2,
  History,
  RefreshCw,
  Search,
  Video,
} from "lucide-react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ObservationFrame } from "../features/observations/ObservationFrame";
import { ObservationPanels } from "../features/observations/ObservationPanels";
import { percentBounds } from "../features/observations/bounds";
import { useOperator } from "../hooks/useOperator";
import { api, errorMessage } from "../services/api";
import { planningApi } from "../services/planningApi";
import type { Observation } from "../types/api";
import "../styles/observations.css";

export function VisualObservations() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const { token } = useOperator();
  const [filter, setFilter] = useState("all");
  const [text, setText] = useState("");
  const [layout, setLayout] = useState("split");
  const [boxes, setBoxes] = useState(true);
  const [focus, setFocus] = useState("");
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const observations = useQuery({
    queryKey: ["observations"],
    queryFn: api.observations,
  });
  const plans = useQuery({
    queryKey: ["observation-plans"],
    queryFn: () => planningApi.list(0),
  });
  const planFrames = [
    ...new Set(plans.data?.items.map((item) => item.plan.observation_id) ?? []),
  ].filter(
    (frameId) => !observations.data?.some((item) => item.id === frameId),
  );
  const privateFrames = useQueries({
    queries: planFrames.map((frameId) => ({
      queryKey: ["observation-detail", frameId, token],
      queryFn: () => api.observation(frameId, token),
      enabled: !!token,
      retry: false,
    })),
  });
  const records = [
    ...(observations.data ?? []),
    ...privateFrames.flatMap((query) => (query.data ? [query.data] : [])),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const requestedId = id || search.get("observation");
  const detail = useQuery({
    queryKey: ["observation-detail", requestedId, token],
    queryFn: () => api.observation(requestedId!, token || undefined),
    enabled: !!requestedId && !records.some((item) => item.id === requestedId),
    retry: false,
  });
  const selected = requestedId
    ? (records.find((item) => item.id === requestedId) ?? detail.data)
    : records[0];
  const relatedPlan = plans.data?.items.find(
    (item) => item.plan.observation_id === selected?.id,
  );
  const scene =
    relatedPlan?.scene.observation_id === selected?.id
      ? relatedPlan?.scene
      : undefined;
  const isProtected = (item: Observation) =>
    !observations.data?.some((record) => record.id === item.id) &&
    !(detail.data?.id === item.id && !token);
  const hasBounds =
    !!selected &&
    !!scene?.elements.some((element) =>
      percentBounds(element, scene, selected),
    );
  const showBoxes = boxes && hasBounds;
  const filtered = records.filter((item) => {
    const plan = plans.data?.items.find(
      (result) => result.plan.observation_id === item.id,
    );
    const matchesFilter =
      filter === "all" ||
      (filter === "browser" && item.source === "browser") ||
      (filter === "planned" && !!plan);
    const haystack = [
      item.id,
      item.page_title,
      item.source_url,
      item.source,
      item.width,
      item.height,
      ...(plan?.scene.elements.flatMap((element) => [
        element.label,
        element.description,
        element.bounding_box ? JSON.stringify(element.bounding_box) : "",
      ]) ?? []),
    ].join(" ");
    return (
      matchesFilter &&
      haystack.toLowerCase().includes(text.trim().toLowerCase())
    );
  });
  const pageSize = layout === "grid" ? 8 : 4;
  const pageCount = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount - 1, 0));
  const capture = useMutation({
    mutationFn: api.capture,
    onSuccess: async (result) => {
      client.setQueryData<Observation[]>(["observations"], (old) => [
        result,
        ...(old ?? []).filter((item) => item.id !== result.id),
      ]);
      setSearch({ observation: result.id });
      setLayout("split");
      await client.invalidateQueries({ queryKey: ["observations"] });
    },
  });
  const refresh = () => {
    void observations.refetch();
    void plans.refetch();
    if (requestedId) void detail.refetch();
    privateFrames.forEach((query) => {
      if (token) void query.refetch();
    });
  };
  const busy =
    observations.isFetching ||
    plans.isFetching ||
    privateFrames.some((query) => query.isFetching);
  const selectedLoading = requestedId
    ? !selected && detail.isPending
    : observations.isPending;
  const selectedError = requestedId ? detail.error : observations.error;
  return (
    <div className="observations-workspace">
      <header className="observations-heading">
        <div>
          <div className="observation-eyebrow">
            <span className="health-dot online" />
            PERCEPTION WORKSPACE / CAPTURED EVIDENCE
          </div>
          <h1>Visual Observations</h1>
          <p>
            Explore captured interfaces, inspect recorded targets and trace the
            evidence behind a plan.
          </p>
        </div>
        <div className="observation-heading-actions">
          <div className="observation-stream">
            <Video size={22} />
            <div>
              <small>RECORDED BROWSER</small>
              <strong>
                {selected
                  ? `OBS #${selected.id.slice(0, 8)}`
                  : "No frame selected"}
              </strong>
            </div>
            <span>SAVED</span>
          </div>
          <button
            className="button secondary"
            disabled={capture.isPending || !!id}
            onClick={() => capture.mutate()}
          >
            <Camera size={15} />
            {capture.isPending ? "Capturing…" : "Capture observation"}
          </button>
        </div>
      </header>
      {id && (
        <Link className="back-link" to="/observations">
          ← All observations
        </Link>
      )}
      <div className="observations-toolbar">
        <label className="observation-search">
          <Search size={17} />
          <input
            aria-label="Search observations"
            placeholder="Search observations, targets, coordinates…"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <div
          className="observation-filter-buttons"
          role="group"
          aria-label="Observation filters"
        >
          {[
            ["all", "All Viewports"],
            ["browser", "Chromium Sandbox"],
            ["planned", "Plan Frames"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="observation-layout-buttons"
          role="group"
          aria-label="Observation layout"
        >
          <button
            aria-pressed={layout === "split"}
            onClick={() => {
              setLayout("split");
              setPage(0);
            }}
          >
            <Columns2 size={15} />
            Split View
          </button>
          <button
            aria-pressed={layout === "grid"}
            onClick={() => {
              setLayout("grid");
              setPage(0);
            }}
          >
            <Grid2X2 size={15} />
            Grid
          </button>
        </div>
        <button
          className="observation-refresh"
          aria-label="Refresh observations"
          disabled={busy}
          onClick={refresh}
        >
          <RefreshCw size={16} className={busy ? "spin" : ""} />
        </button>
      </div>
      {capture.error && (
        <p role="alert" className="error">
          {errorMessage(capture.error)}
        </p>
      )}
      {observations.error && requestedId && (
        <p role="alert" className="error">
          Capture list: {errorMessage(observations.error)}
        </p>
      )}
      {plans.error && (
        <p role="alert" className="planning-warning">
          Saved plan evidence is unavailable: {errorMessage(plans.error)}
        </p>
      )}
      {!!token && privateFrames.some((query) => query.error) && (
        <p className="planning-warning">
          Some protected plan frames could not be loaded. Check your operator
          connection and refresh.
        </p>
      )}
      {layout === "split" && (
        <div className="observations-split">
          <section
            className="observation-viewer-card"
            aria-label="Observation viewer"
          >
            <div className="observation-viewer-heading">
              <div>
                <strong>
                  {selected
                    ? `OBS-VP_${selected.id.slice(0, 8)}`
                    : "CAPTURED VIEWPORT"}
                </strong>
                <span className="observation-small-tag">
                  {selected ? "RECORDED" : "AWAITING INPUT"}
                </span>
              </div>
              <div
                className="observation-view-modes"
                role="group"
                aria-label="Frame display"
              >
                <button
                  aria-pressed={!showBoxes}
                  onClick={() => setBoxes(false)}
                >
                  Raw Frame
                </button>
                <button
                  aria-pressed={showBoxes}
                  onClick={() => setBoxes(true)}
                  disabled={!hasBounds}
                >
                  Identified Bounding Boxes
                </button>
              </div>
            </div>
            {selectedLoading ? (
              <div className="observation-frame-empty" role="status">
                Loading observation…
              </div>
            ) : selectedError && !selected ? (
              <div className="observation-frame-empty">
                <p role="alert" className="error">
                  {errorMessage(selectedError)}
                </p>
                {!token && (
                  <Link to="/?connect=1">
                    Connect your local operator to inspect protected evidence
                  </Link>
                )}
                <button className="button secondary" onClick={refresh}>
                  Retry
                </button>
              </div>
            ) : selected ? (
              <>
                <ObservationFrame
                  key={selected.id + token}
                  observation={selected}
                  scene={scene}
                  token={token}
                  protectedFrame={isProtected(selected)}
                  boxes={showBoxes}
                  focused={focus}
                  onFocus={setFocus}
                />
                <div className="observation-evidence-note">
                  {scene
                    ? "Recorded target estimates from a saved plan. Bounds do not establish localization accuracy."
                    : "Raw screenshot. No structured target bounds are recorded in the loaded plans for this observation."}
                </div>
              </>
            ) : (
              <div className="observation-frame-empty">
                <Camera size={36} />
                <h2>No observations yet</h2>
                <p>
                  Capture the allowlisted inventory sandbox to start a visual
                  record.
                </p>
              </div>
            )}
          </section>
          <aside className="observations-panels">
            <ObservationPanels
              key={selected?.id ?? "empty"}
              observation={selected}
              scene={scene}
              plan={relatedPlan}
              focused={focus}
              onFocus={setFocus}
              token={token}
            />
          </aside>
        </div>
      )}
      <section className="observations-recent" aria-label="Recent observations">
        <div className="observations-recent-heading">
          <h2>
            <History size={19} />
            Recent Observations <small>LATEST CAPTURE RECORDS</small>
          </h2>
          <span>
            {filtered.length} of {records.length} loaded
          </span>
        </div>
        {!token && planFrames.length > 0 && (
          <p className="observation-access-note">
            <Link to="/?connect=1">Connect operator</Link> to include protected
            frames referenced by the latest {plans.data?.items.length} saved
            plans.
          </p>
        )}
        {!filtered.length && (
          <p className="observation-no-results">
            {observations.isPending
              ? "Loading captures…"
              : records.length
                ? "No observations match these filters."
                : "No capture records available."}
          </p>
        )}
        <div className="observations-gallery">
          {filtered
            .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
            .map((item) => (
              <button
                key={item.id}
                className={`observation-capture-card ${item.id === selected?.id ? "selected" : ""}`}
                aria-label={`View observation ${item.id}`}
                aria-pressed={item.id === selected?.id}
                onClick={() => {
                  if (id) navigate(`/observations?observation=${item.id}`);
                  else setSearch({ observation: item.id });
                  setLayout("split");
                  setFocus("");
                }}
              >
                <div className="observation-thumbnail-wrap">
                  <ObservationFrame
                    key={item.id + token}
                    observation={item}
                    token={token}
                    protectedFrame={isProtected(item)}
                    thumbnail
                  />
                  <span className="observation-card-source">
                    {isProtected(item) ? "Plan evidence" : item.source}
                  </span>
                  {item.id === selected?.id && (
                    <span className="observation-card-current">CURRENT</span>
                  )}
                </div>
                <strong>{item.page_title}</strong>
                <div className="observation-card-meta">
                  <span>
                    {item.width} × {item.height}
                  </span>
                  <time dateTime={item.timestamp}>
                    {new Date(item.timestamp).toLocaleString()}
                  </time>
                </div>
              </button>
            ))}
        </div>
        {pageCount > 1 && (
          <div className="observation-pagination">
            <span>
              Page {currentPage + 1} of {pageCount} · Latest 20 public captures
              and 10 saved plans at most
            </span>
            <button
              aria-label="Previous observation page"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Next observation page"
              disabled={currentPage + 1 >= pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </section>
      <p className="observation-footer-note">
        Captured evidence only. Inspecting a frame does not approve or execute a
        browser action.
      </p>
    </div>
  );
}
