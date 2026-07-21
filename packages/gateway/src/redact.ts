export function redactPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return last4 ? `***-***-${last4}` : "***";
}
