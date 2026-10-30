import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useOperator } from "../hooks/useOperator";
export function OperatorConnection() {
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
      <label htmlFor="mission-token">Operator capability</label>
      <input
        id="mission-token"
        type="password"
        autoComplete="off"
        value={draft}
        placeholder={
          token ? "Connected · held in memory" : "Enter local operator token"
        }
        onChange={(e) => setDraft(e.target.value)}
      />
      <button className="button secondary" disabled={!draft}>
        Connect
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
          Disconnect
        </button>
      )}
      <small>Shared across workspaces; cleared on reload.</small>
    </form>
  );
}
