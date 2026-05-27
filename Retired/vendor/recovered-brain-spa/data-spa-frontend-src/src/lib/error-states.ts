export type ErrorStateVariant = "backend-unavailable" | "auth-misconfigured";

export interface ErrorStateContent {
  eyebrow: string;
  title: string;
  detail: string;
}

const ERROR_STATE_CONTENT: Record<ErrorStateVariant, ErrorStateContent> = {
  "backend-unavailable": {
    eyebrow: "Backend unavailable",
    title: "We couldn't reach the backend.",
    detail: "Retry in a moment. If this is production, verify the Railway backend is healthy and running.",
  },
  "auth-misconfigured": {
    eyebrow: "Authentication unavailable",
    title: "We couldn't complete sign-in.",
    detail: "Check the auth configuration and recent deploy health, then try again.",
  },
};

export function getErrorStateContent(variant: ErrorStateVariant): ErrorStateContent {
  return ERROR_STATE_CONTENT[variant];
}
