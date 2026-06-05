import { TestShell } from "./TestShell";
import { testModelPath } from "@/lib/testRoutes";

export function TestInteractiveCoach({ modelKey }: { modelKey: string }) {
  return (
    <TestShell backTo={testModelPath(modelKey)} backLabel="Snake Policy" title="Coach replay">
      <p className="test-scenario-hint">
        Play a human session first, then compare recorded steps to the policy checkpoint. Full coach diff UI ships
        with stored session picker; train a policy then use Human play.
      </p>
    </TestShell>
  );
}