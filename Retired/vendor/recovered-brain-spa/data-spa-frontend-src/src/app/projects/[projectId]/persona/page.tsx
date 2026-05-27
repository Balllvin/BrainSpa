import { notFound } from "next/navigation";

import { ProjectPersonaClient } from "@/components/ProjectPersonaClient";
import { ServerErrorState } from "@/components/ServerErrorState";
import { getProjectPersonaServer, ServerApiError } from "@/lib/server-api";
import { handleProtectedPageDataError, requireProtectedPage } from "@/lib/server-auth";

export default async function ProjectPersonaPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const nextPath = `/projects/${projectId}/persona`;
  const access = await requireProtectedPage(nextPath);
  if (access.kind === "error") {
    return <ServerErrorState primaryActionHref={`/auth/refresh?next=${encodeURIComponent(nextPath)}`} primaryActionLabel="Retry" variant={access.variant} />;
  }

  try {
    const data = await getProjectPersonaServer(Number(projectId));
    return <ProjectPersonaClient initialData={data} />;
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
