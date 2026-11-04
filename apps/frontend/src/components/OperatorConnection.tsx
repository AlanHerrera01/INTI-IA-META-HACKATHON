import { useLocale } from "../i18n/useLocale";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useOperator } from "../hooks/useOperator";
export function OperatorConnection() {
  const { t } = useLocale();
  const { token, setToken, notify } = useOperator();
  const [draft, setDraft] = useState("");
  const cache = useQueryClient();
  return (
    <form
      className="operator-connection"
      onSubmit={(e) => {
        e.preventDefault();
        setToken(draft);
        setDraft("");
        notify(
          "Operator connected for this session. Approvals remain explicit.",
        );
      }}
    >
      <LockKeyhole size={17} />
      <label htmlFor="mission-token">{t("Operator capability")}</label>
      <input
        id="mission-token"
        type="password"
        autoComplete="off"
        value={draft}
        placeholder={
          token
            ? t("Connected · held in memory")
            : t("Enter local operator token")
        }
        onChange={(e) => setDraft(e.target.value)}
      />
      <button className="button secondary" disabled={!draft}>
        {t("Connect")}
      </button>
      {token && (
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setToken("");
            setDraft("");
            cache.clear();
            notify("Disconnected. The local capability was cleared.");
          }}
        >
          {t("Disconnect")}
        </button>
      )}
      <small>{t("Shared across workspaces; cleared on reload.")}</small>
    </form>
  );
}
