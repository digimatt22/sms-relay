const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isWriteFenceEnabled(
  value = process.env.RELAYHUB_WRITE_FENCE,
): boolean {
  return value === "true";
}

export function shouldBlockWrite(
  method: string,
  fenceEnabled = isWriteFenceEnabled(),
): boolean {
  return fenceEnabled && !READ_ONLY_METHODS.has(method.toUpperCase());
}
