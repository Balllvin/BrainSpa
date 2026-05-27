import { ServerErrorState } from "@/components/ServerErrorState";
import { SettingsClient } from "@/components/SettingsClient";
import { listSessionsServer } from "@/lib/server-api";
import { handleProtectedPageDataError, requireProtectedPage } from "@/lib/server-auth";

export default async function SettingsPage() {
  const access = await requireProtectedPage("/settings");
  if (access.kind === "error") {
    return <ServerErrorState primaryActionHref="/auth/refresh?next=%2Fsettings" primaryActionLabel="Retry" variant={access.variant} />;
  }

  try {
    const sessions = await listSessionsServer();
    return <SettingsClient sessions={sessions} user={access.session.user} />;
  } catch (error) {
    const outcome = handleProtectedPageDataError(error, access.session);
    return (
      <ServerErrorState
        detail={outcome.detail}
        primaryActionHref={outcome.primaryActionHref || "/auth/refresh?next=%2Fsettings"}
        primaryActionLabel={outcome.primaryActionLabel || "Retry"}
        secondaryActionHref={outcome.secondaryActionHref}
        secondaryActionLabel={outcome.secondaryActionLabel}
        title={outcome.title}
        variant={outcome.variant}
      />
    );
  }
}
