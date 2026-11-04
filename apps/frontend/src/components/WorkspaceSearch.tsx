import { useLocale } from "../i18n/useLocale";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { Link } from "react-router-dom";
import { navigation } from "../app/navigation";

export function WorkspaceSearch({
  items = navigation,
}: {
  items?: typeof navigation;
}) {
  const { t } = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const matches = items.filter((item) =>
    `${t(item.label)} ${t(item.group)} ${item.label}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else {
          dialog.current?.showModal();
          searchInput.current?.focus();
        }
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);

  return (
    <>
      <button
        className="workspace-search-trigger"
        onClick={() => {
          dialog.current?.showModal();
          searchInput.current?.focus();
        }}
        aria-label={t("Search workspaces")}
        aria-keyshortcuts="Control+k Meta+k"
      >
        <Search size={16} aria-hidden="true" />
        <span>{t("Search workspaces")}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <dialog
        className="workspace-search-dialog"
        ref={dialog}
        aria-labelledby="workspace-search-title"
        onClose={() => setQuery("")}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="workspace-search-content">
          <div className="workspace-search-heading">
            <h2 id="workspace-search-title">{t("Find a workspace")}</h2>
            <form method="dialog">
              <button aria-label={t("Close workspace search")}>
                <X size={18} />
              </button>
            </form>
          </div>
          <label className="workspace-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchInput}
              aria-label={t("Workspace name")}
              placeholder={t("Planning, recovery, tasks…")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <ul>
            {matches.map(({ to, label, icon: Icon, group }) => (
              <li key={to}>
                <Link to={to} onClick={() => dialog.current?.close()}>
                  <Icon size={18} aria-hidden="true" />
                  <span>
                    {t(label)}
                    <small>{t(group)}</small>
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {matches.length === 0 && (
            <p role="status" className="workspace-search-empty">
              {t("No workspace matches “")}
              {query}”.
            </p>
          )}
          <p className="workspace-search-hint">
            {t("Navigate with Tab · Open with Enter · Close with Escape")}
          </p>
        </div>
      </dialog>
    </>
  );
}
