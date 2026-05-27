import { ServerErrorState } from "@/components/ServerErrorState";
import { buildLoginPath, buildRefreshPath, normalizeNextPath } from "@/lib/auth-routing";
import type { ErrorStateVariant } from "@/lib/error-states";

function normalizeVariant(value: string | undefined): ErrorStateVariant {
  return value === "auth-misconfigured" ? "auth-misconfigured" : "backend-unavailable";
}

export default async function AuthUnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; variant?: string }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNextPath(params.next);
  const variant = normalizeVariant(params.variant);
  const detail = variant === "backend-unavailable" ? "Try again after the backend is healthy." : undefined;

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <ServerErrorState
          detail={detail}
          primaryActionHref={buildRefreshPath(nextPath)}
          primaryActionLabel="Retry"
          secondaryActionHref={buildLoginPath(nextPath)}
          secondaryActionLabel="Go to sign in"
          variant={variant}
        />
      </div>
    </main>
  );
}
