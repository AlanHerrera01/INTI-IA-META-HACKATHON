import { ClipboardCheck, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { RecoveryBundle } from "../../types/recovery";

export function RecoveryAudit({ bundle }: { bundle?: RecoveryBundle }) {
  const latest = bundle?.diagnoses.at(-1);
  const lastResult = bundle?.results.at(-1);
  return (
    <section className="recovery-audit" aria-label="Recovery audit and proof">
      <header>
        <h2>
          <ShieldCheck size={19} />
          Audit &amp; Proof Strategy
        </h2>
        <span>{bundle?.session.status || "NO RECORD"}</span>
      </header>
      <div className="recovery-audit-fact">
        <h3>ERROR CLASSIFICATION</h3>
        <strong>
          {latest?.failure_type ||
            bundle?.session.initial_failure_type ||
            "Unavailable"}
        </strong>
        <p>
          {bundle?.context.error_details || "No structured failure captured."}
        </p>
      </div>
      <div className="recovery-audit-fact">
        <h3>FAILED ACTION</h3>
        <code>{bundle?.session.failed_action_id || "No action reference"}</code>
        <p>
          {bundle?.context.observed_state ||
            "Observed state appears with a recovery record."}
        </p>
      </div>
      <div className="recovery-audit-fact">
        <h3>RECORDED REPAIR RESULT</h3>
        <strong>{lastResult?.status || "No result recorded"}</strong>
        <p>
          {lastResult
            ? `Action executed: ${String(lastResult.action_executed)} · Postconditions: ${lastResult.postconditions_satisfied == null ? "Unknown" : String(lastResult.postconditions_satisfied)}`
            : "A proposed repair is not evidence of execution."}
        </p>
        {lastResult?.may_have_executed && (
          <p className="execution-error">
            May have executed. Review persisted evidence before retrying.
          </p>
        )}
      </div>
      <div className="recovery-audit-fact">
        <h3>INDEPENDENT TASK OUTCOME</h3>
        <p>
          Recovered describes the interrupted action's checks. Independent
          verification determines persisted task success.
        </p>
        {bundle && (
          <Link to={`/verification?execution=${bundle.session.execution_id}`}>
            <ClipboardCheck size={14} />
            Verify persisted outcome →
          </Link>
        )}
      </div>
      {bundle?.plan && (
        <div className="recovery-audit-fact">
          <h3>REPAIR MANIFEST SHA-256</h3>
          <code>{bundle.plan.digest}</code>
          <p>
            Digest identifies the scoped repair plan; it is not independent
            outcome proof.
          </p>
        </div>
      )}
      {!bundle && (
        <Link className="recovery-open-execution" to="/execution">
          Inspect saved executions →
        </Link>
      )}
    </section>
  );
}

export function RecoveryDiagnoses({ bundle }: { bundle?: RecoveryBundle }) {
  return (
    <section className="recovery-diagnoses" aria-label="Recorded diagnoses">
      <header>
        <h2>Recorded Diagnoses</h2>
        <span>{bundle?.diagnoses.length || 0} RECORDS</span>
      </header>
      {!bundle?.diagnoses.length ? (
        <p className="recovery-small-note">
          No observed facts, hypotheses or changed regions recorded.
        </p>
      ) : (
        [...bundle.diagnoses].reverse().map((diagnosis, index) => (
          <details open={index === 0} key={diagnosis.id}>
            <summary>
              {diagnosis.failure_type} · {diagnosis.change_summary}
            </summary>
            <div className="recovery-diagnosis-columns">
              <div>
                <h3>Observed facts</h3>
                <ul>
                  {diagnosis.observed_facts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Hypotheses</h3>
                <ul>
                  {diagnosis.hypotheses.map((hypothesis, i) => (
                    <li key={i}>{hypothesis}</li>
                  ))}
                </ul>
              </div>
            </div>
            <h3>Uncertainties</h3>
            <p>{diagnosis.uncertainties.join("; ") || "None declared"}</p>
            <h3>Relevant target regions</h3>
            <p>
              {diagnosis.candidate_targets
                .map((target) => `${target.role}: ${target.name}`)
                .join("; ") || "No candidate controls declared"}
            </p>
            <pre>
              {diagnosis.changed_regions?.length
                ? JSON.stringify(diagnosis.changed_regions, null, 2)
                : "No reliable changed regions proposed"}
            </pre>
          </details>
        ))
      )}
      {bundle && (
        <>
          <h3>Validation warnings</h3>
          <p>
            {bundle.warnings.join("; ") || "No validation warnings recorded"}
          </p>
        </>
      )}
    </section>
  );
}
