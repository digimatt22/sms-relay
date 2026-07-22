export const DEFAULT_PLATFORM_NAME = "DigiColony SNS";

export function getPlatformName() {
  const configuredName = process.env.PLATFORM_NAME?.trim();
  return configuredName || DEFAULT_PLATFORM_NAME;
}

export function getPublicAppUrl() {
  const configuredUrl =
    process.env.RELAYHUB_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim();
  return (configuredUrl || "http://localhost:3000").replace(/\/+$/, "");
}
