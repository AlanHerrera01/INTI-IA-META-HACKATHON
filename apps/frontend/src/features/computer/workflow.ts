import type { ComputerTask } from "../../services/computerApi";

export const taskName = (task: ComputerTask) =>
  task.plan.kind === "open_application"
    ? task.plan.application.name
    : task.plan.filename;

export function localMetrics(tasks: ComputerTask[]) {
  return {
    total: tasks.length,
    active: tasks.filter((task) => ["QUEUED", "RUNNING"].includes(task.status))
      .length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
    attention: tasks.filter((task) =>
      ["FAILED", "INTERRUPTED"].includes(task.status),
    ).length,
    fileReadbacks: tasks
      .flatMap((task) => task.result?.steps || [])
      .filter((step) => step.status === "VERIFIED_READBACK").length,
    launches: tasks
      .flatMap((task) => task.result?.steps || [])
      .filter((step) => step.status === "LAUNCH_REQUESTED").length,
  };
}

export function recoveryCandidate(task: ComputerTask) {
  return ["FAILED", "INTERRUPTED", "CANCELLED"].includes(task.status);
}
