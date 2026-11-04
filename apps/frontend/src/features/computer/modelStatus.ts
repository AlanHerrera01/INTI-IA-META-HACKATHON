import type { ModelStatus } from "../../types/api";

export function modelAccessState(status?: ModelStatus): string {
  if (!status?.configured) return "Not configured";
  if (status.available === true) return "Access verified";
  if (status.available === false) return "Last request failed";
  return "Unverified";
}
