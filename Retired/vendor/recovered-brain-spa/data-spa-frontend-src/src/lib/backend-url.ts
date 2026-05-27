const LOCAL_BACKEND_URL = "http://127.0.0.1:8000";

export class BackendUrlConfigurationError extends Error {}

function normalizeBackendUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function isProductionEnvironment(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV || "development") === "production";
}

function parseConfiguredBackendUrl(value: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new BackendUrlConfigurationError(
      "BACKEND_URL or NEXT_PUBLIC_API_URL must be a valid absolute http(s) URL."
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new BackendUrlConfigurationError(
      "BACKEND_URL or NEXT_PUBLIC_API_URL must use http:// or https://."
    );
  }

  return normalizeBackendUrl(parsedUrl.toString());
}

export function resolveBackendUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configuredUrl = env.BACKEND_URL?.trim() || env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return parseConfiguredBackendUrl(configuredUrl);
  }

  if (isProductionEnvironment(env)) {
    throw new BackendUrlConfigurationError(
      "BACKEND_URL or NEXT_PUBLIC_API_URL must be set for frontend production runtime."
    );
  }

  return LOCAL_BACKEND_URL;
}

export function buildBackendUrl(path: string, env: NodeJS.ProcessEnv = process.env): string {
  const backendUrl = resolveBackendUrl(env);
  return new URL(path, `${backendUrl}/`).toString();
}
