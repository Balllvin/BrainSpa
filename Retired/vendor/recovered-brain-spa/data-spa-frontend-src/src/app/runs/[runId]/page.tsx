import { notFound } from "next/navigation";

import { RunDetailClient } from "@/components/RunDetailClient";
import { ServerErrorState } from "@/components/ServerErrorState";
import { getRunServer, ServerApiError } from "@/lib/server-api";
import { handleProtectedPageDataError, requireProtectedPage } from "@/lib/server-auth";

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const nextPath = `/runs/${runId}`;
  const access = await requireProtectedPage(nextPath);
  if (access.kind === "error") {
    return <ServerErrorState primaryActionHref={`/auth/refresh?next=${encodeURIComponent(nextPath)}`} primaryActionLabel="Retry" variant={access.variant} />;
  }

  try {
    const run = await getRunServer(Number(runId));
    return <RunDetailClient initialRun={run} />;
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) {
      notFound();
    }
    const outcome = handleProtectedPageDataError(error, access.session);
    return (
      <ServerErrorState
        detail={outcome.detail}
        primaryActionHref={outcome.primaryActionHref || `/auth/refresh?next=${encodeURIComponent(nextPath)}`}
        primaryActionLabel={outcome.primaryActionLabel || "Retry"}
        secondaryActionHref={outcome.secondaryActionHref}
        secondaryActionLabel={outcome.secondaryActionLabel}
        title={outcome.title}
        variant={outcome.variant}
      />
    );
  }
}
