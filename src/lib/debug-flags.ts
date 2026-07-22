export function isRecipientConsentDebugBypassEnabled() {
  return process.env.DEBUG_BYPASS_RECIPIENT_CONSENT?.trim().toLowerCase() === "true";
}
