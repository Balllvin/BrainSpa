import { DashboardClient } from "@/components/DashboardClient";
import { ServerErrorState } from "@/components/ServerErrorState";
import { listProjectsServer } from "@/lib/server-api";
import { handleProtectedPageDataError, requireProtectedPage } from "@/lib/server-auth";

export default async function HomePage() {
  const access = await requireProtectedPage("/");
  if (access.kind === "error") {
    return <ServerErrorState primaryActionHref="/auth/refresh?next=%2F" primaryActionLabel="Retry" variant={access.variant} />;
  }

  try {
    const projects = await listProjectsServer();
    return <DashboardClient initialProjects={projects} />;
  } catch (error) {
    const outcome = handleProtectedPageDataError(error, access.session);
    return (
      <ServerErrorState
        detail={outcome.detail}
        primaryActionHref={outcome.primaryActionHref || "/auth/refresh?next=%2F"}
        primaryActionLabel={outcome.primaryActionLabel || "Retry"}
        secondaryActionHref={outcome.secondaryActionHref}
        secondaryActionLabel={outcome.secondaryActionLabel}
        title={outcome.title}
        variant={outcome.variant}
      />
    );
  }
}
