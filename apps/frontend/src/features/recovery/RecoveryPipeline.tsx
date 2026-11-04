import { Check, Circle, Workflow } from "lucide-react";
import type { RecoveryBundle } from "../../types/recovery";

export function RecoveryPipeline({ bundle }: { bundle?: RecoveryBundle }) {
  const diagnosis = bundle?.diagnoses.at(-1);
  const stages = [
    {
      title: "Structured failure detected",
      recorded: !!bundle,
      text:
        bundle?.session.initial_failure_type || "Awaiting an execution failure",
    },
    {
      title: "Recorded diagnosis",
      recorded: !!diagnosis,
      text: diagnosis?.change_summary || "No diagnosis recorded",
    },
    {
      title: "Proposed bounded repair",
      recorded: !!bundle?.plan,
      text: bundle?.plan?.objective || "No repair plan recorded",
    },
    {
      title: "Authorization boundary",
      recorded: !!bundle?.plan_approved,
      text: bundle?.plan_approved
        ? "Plan approved · action-level gates still apply"
        : bundle?.plan?.decision.requires_approval
          ? "Renewed approval required"
          : "Backend policy governs repair authority",
    },
    {
      title: "Attempts and immediate checks",
      recorded: bundle?.session.status === "RECOVERED",
      text: bundle
        ? `${bundle.session.attempts_count} recorded attempts · ${bundle.session.status.replaceAll("_", " ")}`
        : "No attempt or outcome recorded",
    },
  ];
  return (
    <section className="recovery-pipeline" aria-label="Recovery pipeline">
      <header>
        <h3>
          <Workflow size={15} />
          RECOVERY PIPELINE
        </h3>
        <span>{bundle ? "RECORDED FACTS" : "AWAITING EVIDENCE"}</span>
      </header>
      <ol>
        {stages.map((stage, index) => (
          <li
            key={stage.title}
            className={stage.recorded ? "recorded" : "unrecorded"}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{stage.title}</strong>
              <p>{stage.text}</p>
            </div>
            {stage.recorded ? <Check size={14} /> : <Circle size={13} />}
          </li>
        ))}
      </ol>
      <p className="recovery-small-note">
        Each stage reflects saved evidence. Recovery does not establish
        independent task success.
      </p>
    </section>
  );
}
