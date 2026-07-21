export const DEFAULT_PLATFORM_NAME = "DigiColony SNS";

export function getPlatformName() {
  const configuredName = process.env.PLATFORM_NAME?.trim();
  return configuredName || DEFAULT_PLATFORM_NAME;
}
