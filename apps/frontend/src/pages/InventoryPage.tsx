import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Download,
  MapPin,
  Monitor,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { inventoryApi } from "../services/inventoryApi";
import { errorMessage } from "../services/api";
import { filterAssets, inventoryStatuses } from "../features/inventory/data";
import { downloadTaskJson } from "../features/tasks/records";
import "../styles/inventory.css";

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["hardware-inventory"],
    queryFn: inventoryApi.list,
    refetchInterval: 10000,
    retry: false,
  });
  const loaded = query.isSuccess && !query.error;
  const assets = loaded ? query.data : [];
  const locations = [...new Set(assets.map((asset) => asset.location))].sort();
  const locationOptions = [
    ...new Set([...locations, ...(location ? [location] : [])]),
  ].sort();
  const filtered = filterAssets(assets, text, location, status);
  const pageSize = 5;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const selected =
    visible.find((asset) => asset.id === params.get("asset")) ?? visible[0];
  const operational = assets.filter(
    (asset) => asset.status === "Operational",
  ).length;
  const reset = () => {
    setText("");
    setLocation("");
    setStatus("");
    setPage(0);
  };
  return (
    <div className="inventory-workspace">
      <header className="inventory-heading">
        <div>
          <p className="inventory-eyebrow">
            INTI AI / CONNECTED APPS / SYNTHETIC INVENTORY{" "}
            <span
              className={
                loaded ? "inventory-connected" : "inventory-disconnected"
              }
            >
              {query.error
                ? "UNAVAILABLE"
                : loaded
                  ? "DATA LOADED"
                  : "CONNECTING"}
            </span>
          </p>
          <h1>Hardware &amp; IT Asset Inventory</h1>
          <p>
            Inspect the connected equipment catalog, current locations and
            persisted record versions.
          </p>
        </div>
        <div className="inventory-heading-actions">
          <button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={15} className={query.isFetching ? "spin" : ""} />
            {query.isFetching ? "Refreshing…" : "Refresh inventory"}
          </button>
          <a
            className="inventory-open-sandbox"
            href="http://localhost:8001"
            target="_blank"
            rel="noreferrer"
          >
            Open editable sandbox <ArrowUpRight size={14} />
          </a>
        </div>
      </header>
      <div className="inventory-metrics">
        <section aria-label="Fleet catalog">
          <div>
            <h2>FLEET CATALOG</h2>
            <Monitor size={22} />
          </div>
          <strong>
            {loaded ? assets.length : "—"}
            <span>RECORDED ASSETS</span>
          </strong>
          <p>Current equipment records from the connected sandbox.</p>
        </section>
        <section aria-label="Recorded locations">
          <div>
            <h2>RECORDED LOCATIONS</h2>
            <MapPin size={22} />
          </div>
          <strong>
            {loaded ? locations.length : "—"}
            <span>DISTINCT LOCATIONS</span>
          </strong>
          <p>Locations present in the current inventory snapshot.</p>
        </section>
        <section aria-label="Operational assets">
          <div>
            <h2>OPERATIONAL ASSETS</h2>
            <CheckCircle2 size={22} />
          </div>
          <strong>
            {loaded ? operational : "—"}
            <span>EXACT STATUS MATCH</span>
          </strong>
          <p>Rows marked Operational. Other states remain distinct.</p>
        </section>
      </div>
      <div className="inventory-toolbar">
        <label className="inventory-search">
          <Search size={17} />
          <input
            aria-label="Search hardware inventory"
            placeholder="Asset ID, equipment, location…"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPage(0);
            }}
          />
          {text && (
            <button
              aria-label="Clear inventory search"
              onClick={() => {
                setText("");
                setPage(0);
              }}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <label>
          LOCATION
          <select
            aria-label="Filter hardware location"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All locations</option>
            {locationOptions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          STATE
          <select
            aria-label="Filter hardware status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">All states</option>
            {inventoryStatuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button className="inventory-reset" onClick={reset}>
          Reset filters
        </button>
      </div>
      {query.error && (
        <p className="inventory-error" role="alert">
          {errorMessage(query.error)}{" "}
          <button onClick={() => void query.refetch()}>Retry inventory</button>
        </p>
      )}
      <div className="inventory-layout">
        <section
          className="inventory-ledger"
          aria-label="Registered fleet assets"
        >
          <header>
            <h2>
              Registered Fleet Assets <span>{filtered.length} MATCHES</span>
            </h2>
            <div>
              <span>READ-ONLY VIEW</span>
              <button
                aria-label="Export filtered inventory as JSON"
                disabled={!loaded || !filtered.length}
                onClick={() =>
                  downloadTaskJson("inti-inventory-filtered.json", {
                    scope:
                      "All matching records in the current inventory snapshot",
                    assets: filtered,
                  })
                }
              >
                <Download size={15} />
              </button>
            </div>
          </header>
          {!loaded ? (
            <div className="inventory-empty">
              {query.error
                ? "Current inventory is unavailable. Refresh to reconnect."
                : "Loading connected inventory…"}
            </div>
          ) : !filtered.length ? (
            <div className="inventory-empty">
              <Boxes size={30} />
              <h3>
                {assets.length
                  ? "No assets match these filters"
                  : "No assets recorded"}
              </h3>
              <p>
                {assets.length
                  ? "Change the search, location or state to inspect another asset."
                  : "The connected inventory returned an empty catalog."}
              </p>
            </div>
          ) : (
            <div className="inventory-table-scroll">
              <table className="inventory-table">
                <caption className="sr-only">
                  Current synthetic hardware asset records
                </caption>
                <thead>
                  <tr>
                    <th scope="col">ASSET &amp; RECORD</th>
                    <th scope="col">PHYSICAL LOCATION</th>
                    <th scope="col">STATUS</th>
                    <th scope="col">VERSION</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((asset) => (
                    <tr
                      key={asset.id}
                      data-asset-id={asset.id}
                      className={
                        selected?.id === asset.id ? "selected-asset" : ""
                      }
                    >
                      <td>
                        <button
                          className="inventory-select-asset"
                          aria-label={`Inspect asset ${asset.id}`}
                          aria-pressed={selected?.id === asset.id}
                          onClick={() => setParams({ asset: asset.id })}
                        >
                          <span className="inventory-asset-icon">
                            <Monitor size={22} />
                          </span>
                          <span>
                            <strong>{asset.name}</strong>
                            <small>#{asset.id} · Current record</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="inventory-location">
                          <MapPin size={13} />
                          {asset.location}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`inventory-state inventory-state-${asset.status.toLowerCase().replaceAll(" ", "-")}`}
                        >
                          <i />
                          {asset.status}
                        </span>
                      </td>
                      <td>
                        <code>v{asset.version}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <footer className="inventory-pagination">
            <span>
              {loaded
                ? `${visible.length ? currentPage * pageSize + 1 : 0}–${currentPage * pageSize + visible.length} of ${filtered.length} matching / ${assets.length} total records`
                : "No current snapshot"}
            </span>
            <div>
              <button
                aria-label="Previous inventory page"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                PREV
              </button>
              <span>
                PAGE {currentPage + 1} OF {pages}
              </span>
              <button
                aria-label="Next inventory page"
                disabled={!loaded || currentPage + 1 >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                NEXT
              </button>
            </div>
          </footer>
        </section>
        <aside className="inventory-inspector" aria-label="Inspection target">
          <section className="inventory-inspection-card">
            <header>
              <h2>Inspection Target</h2>
              <span>{selected ? `#${selected.id}` : "NO SELECTION"}</span>
            </header>
            {selected ? (
              <>
                <div className="inventory-selected-heading">
                  <span className="inventory-asset-icon">
                    <Monitor size={27} />
                  </span>
                  <div>
                    <h3>{selected.name}</h3>
                    <p>Asset #{selected.id}</p>
                    <span
                      className={`inventory-state inventory-state-${selected.status.toLowerCase().replaceAll(" ", "-")}`}
                    >
                      {selected.status}
                    </span>
                  </div>
                </div>
                <dl className="inventory-record-facts">
                  <div>
                    <dt>Physical location</dt>
                    <dd>{selected.location}</dd>
                  </div>
                  <div>
                    <dt>Persisted version</dt>
                    <dd>v{selected.version}</dd>
                  </div>
                  <div>
                    <dt>Custodian / specifications</dt>
                    <dd>Not recorded</dd>
                  </div>
                  <div>
                    <dt>Last record edit</dt>
                    <dd>Timestamp not recorded</dd>
                  </div>
                </dl>
                <h3 className="inventory-section-label">
                  CURRENT RECORD SNAPSHOT
                </h3>
                <div className="inventory-snapshot">
                  <p>
                    Current values loaded from the connected inventory. A
                    version number identifies the stored revision.
                  </p>
                  <dl>
                    <div>
                      <dt>id</dt>
                      <dd>{selected.id}</dd>
                    </div>
                    <div>
                      <dt>name</dt>
                      <dd>{selected.name}</dd>
                    </div>
                    <div>
                      <dt>location</dt>
                      <dd>{selected.location}</dd>
                    </div>
                    <div>
                      <dt>status</dt>
                      <dd>{selected.status}</dd>
                    </div>
                    <div>
                      <dt>version</dt>
                      <dd>{selected.version}</dd>
                    </div>
                  </dl>
                </div>
                <div className="inventory-inspector-actions">
                  <button
                    onClick={() =>
                      downloadTaskJson(
                        `inti-asset-${selected.id}.json`,
                        selected,
                      )
                    }
                  >
                    <Download size={14} />
                    Download record
                  </button>
                  <a
                    href="http://localhost:8001"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Edit in sandbox <ArrowUpRight size={14} />
                  </a>
                </div>
              </>
            ) : (
              <div className="inventory-empty">
                <Monitor size={28} />
                <p>
                  {query.error
                    ? "Asset details are unavailable."
                    : "Select a current asset record to inspect it."}
                </p>
              </div>
            )}
          </section>
          <section className="inventory-audit-note">
            <ShieldCheck size={21} />
            <div>
              <h2>Evidence &amp; change history</h2>
              <p>
                This catalog provides current values and record versions. Edit
                history, audit seals and asset certifications are not recorded
                here.
              </p>
              <Link to="/tasks">Review automation evidence →</Link>
            </div>
          </section>
        </aside>
      </div>
      <p className="inventory-freshness">
        {loaded && query.dataUpdatedAt
          ? `Last fetched ${new Date(query.dataUpdatedAt).toLocaleString()}. `
          : ""}
        Viewing and refreshing this catalog does not change inventory records.
        Use the existing sandbox or an explicitly approved task to edit an
        asset.
      </p>
    </div>
  );
}
