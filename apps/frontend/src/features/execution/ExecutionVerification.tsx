import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { verificationApi } from "../../services/verificationApi";
import { VerdictBadge } from "../verification/VerdictBadge";

export function ExecutionVerification({
  id,
  token,
}: {
  id: string;
  token: string;
}) {
  const history = useQuery({
    queryKey: ["execution-verifications", id, token],
    queryFn: () => verificationApi.list(token, 0, id),
    enabled: !!token,
    refetchInterval: 3000,
    retry: false,
  });
  const latest = history.data?.items[0];
  const report = useQuery({
    queryKey: ["execution-verification-report", latest?.session.id, token],
    queryFn: () => verificationApi.report(latest!.session.id, token),
    enabled: !!latest,
    refetchInterval: 3000,
    retry: false,
  });
  return (
    <section
      className="execution-panel live-independent-verification"
      aria-label="Independent task verification"
    >
      <h2>Independent task verification</h2>
      <VerdictBadge
        verdict={
          history.error || report.error
            ? undefined
            : report.data?.effective_verdict
        }
      />
      <p>
        {history.error || report.error
          ? "Verification service unavailable. No outcome can be confirmed here."
          : "The saved action result and the persisted task outcome are evaluated separately."}
      </p>
      <Link to={`/verification?execution=${id}`}>Open Verification Center</Link>
      <p>
        <Link to="/recovery">Review recovery history</Link>
      </p>
    </section>
  );
}
