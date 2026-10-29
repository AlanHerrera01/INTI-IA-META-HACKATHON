import type { Verdict } from "../../types/verification";
export function VerdictBadge({
  verdict,
}: {
  verdict: Verdict | null | undefined;
}) {
  const state =
    verdict === "VERIFIED_SUCCESS"
      ? "pass"
      : verdict === "VERIFIED_FAILURE"
        ? "fail"
        : verdict === "INCONCLUSIVE"
          ? "unknown"
          : "pending";
  return (
    <strong className={`verdict-badge verdict-${state}`} role="status">
      {verdict || "NOT VERIFIED"}
    </strong>
  );
}
