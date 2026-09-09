import { MonitorBoard } from "@/app/monitor/monitor-board";
import { runRuntimeDiagnostics } from "@/lib/runtime-monitor";

export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  return <MonitorBoard initial={await runRuntimeDiagnostics()} />;
}
