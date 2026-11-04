import {
  BarChart3,
  Bot,
  Cpu,
  Grid2X2,
  ListChecks,
  PlayCircle,
  ScanLine,
  Settings2,
  ShieldCheck,
  Terminal,
  Wrench,
  Monitor,
} from "lucide-react";

export const navigation = [
  { to: "/", label: "Overview", icon: Grid2X2, group: "Main", end: true },
  { to: "/planning", label: "AI Agent Studio", icon: Bot, group: "Main" },
  {
    to: "/execution",
    label: "Live Execution",
    icon: PlayCircle,
    group: "Main",
  },
  {
    to: "/observations",
    label: "Visual Observations",
    icon: ScanLine,
    group: "Main",
  },
  { to: "/tasks", label: "Task Manager", icon: ListChecks, group: "Main" },
  {
    to: "/inventory",
    label: "Computers & Applications",
    icon: Monitor,
    group: "Connected Apps",
  },
  {
    to: "/recovery",
    label: "Recovery Center",
    icon: Wrench,
    group: "Intelligence",
  },
  {
    to: "/verification",
    label: "Verification Lab",
    icon: ShieldCheck,
    group: "Intelligence",
  },
  {
    to: "/benchmarks",
    label: "Analytics & Benchmarks",
    icon: BarChart3,
    group: "Intelligence",
  },
  { to: "/models", label: "AI Models", icon: Cpu, group: "Intelligence" },
  { to: "/activity", label: "Activity Logs", icon: Terminal, group: "System" },
  { to: "/system", label: "Settings", icon: Settings2, group: "System" },
];
export const computerNavigation = [
  {
    to: "/computer",
    label: "Computer Control",
    icon: Monitor,
    group: "Connected Apps",
    end: true,
  },
  {
    to: "/computer/tasks",
    label: "Computer Tasks",
    icon: ListChecks,
    group: "Connected Apps",
  },
  {
    to: "/computer/permissions",
    label: "Computers & Permissions",
    icon: Settings2,
    group: "System",
  },
];
export function workspaceLabel(pathname: string) {
  if (pathname === "/missions/new") return "New task";
  if (pathname.startsWith("/missions/")) return "Mission detail";
  return (
    navigation.find((item) =>
      item.to === "/" ? pathname === "/" : pathname.startsWith(item.to),
    )?.label ?? "Workspace"
  );
}
