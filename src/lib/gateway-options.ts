export const SUPPORTED_GATEWAY_HARDWARE = [
  {
    value: "RelayHub Edge One",
    label: "RelayHub Edge One",
    description: "Managed RelayHub SMS gateway appliance"
  }
] as const;

export const SUPPORTED_GATEWAY_CARRIERS = [
  {
    value: "Tello",
    label: "Tello",
    network: "T-Mobile",
    apn: "",
    apnLabel: "Not required for SMS-only Wi-Fi backhaul"
  }
] as const;

export function gatewayHardwareLabel(value?: string | null) {
  if (!value) return "-";
  if (value === "Raspberry Pi Zero 2 W") return "RelayHub Edge One";
  return SUPPORTED_GATEWAY_HARDWARE.find((hardware) => hardware.value === value)?.label || value;
}

export function gatewayCarrierLabel(value?: string | null) {
  if (!value) return "-";
  return SUPPORTED_GATEWAY_CARRIERS.find((carrier) => carrier.value === value)?.label || value;
}

export function gatewayApnLabel(value?: string | null) {
  if (!value) return "Not required";
  if (value === "wholesale") return "wholesale";
  return value;
}
