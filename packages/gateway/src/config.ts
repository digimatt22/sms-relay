import { readFileSync, existsSync } from "node:fs";

export type GatewayConfig = {
  hubUrl: string;
  apiKey: string;
  softwareVersion: string;
  packageUrl: string;
  installDir: string;
  serviceName: string;
  apn?: string;
  carrier?: string;
  modemMode: "mock" | "sim7070";
  serialDevice: string;
  serialBaudRate: number;
  powerKeyGpio?: number;
  simcomCnmp?: number;
  simcomCmnb?: number;
  heartbeatSeconds: number;
  pollSeconds: number;
  inboundPollSeconds: number;
  modemResetFailureThreshold: number;
  processRestartFailureThreshold: number;
  resetModemAfterSend: boolean;
  modemTrace: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
};

export function loadConfig(): GatewayConfig {
  const configPath = process.env.RELAYHUB_CONFIG || "/etc/relayhub/gateway.env";
  const fileValues = existsSync(configPath) ? parseEnv(readFileSync(configPath, "utf8")) : {};
  const value = (key: string, fallback = "") => process.env[key] || fileValues[key] || fallback;
  const hubUrl = value("RELAYHUB_HUB_URL", "https://sns.digicolony.net").replace(/\/$/, "");

  return {
    hubUrl,
    apiKey: value("RELAYHUB_GATEWAY_KEY"),
    softwareVersion: packageVersion(),
    packageUrl: value("RELAYHUB_GATEWAY_PACKAGE_URL", `${hubUrl}/gateway.tar.gz`),
    installDir: value("RELAYHUB_INSTALL_DIR", "/opt/relayhub-gateway"),
    serviceName: value("RELAYHUB_SERVICE_NAME", "relayhub-gateway"),
    apn: value("RELAYHUB_APN"),
    carrier: value("RELAYHUB_CARRIER"),
    modemMode: value("RELAYHUB_MODEM_MODE", "mock") === "sim7070" ? "sim7070" : "mock",
    serialDevice: value("RELAYHUB_SERIAL_DEVICE", "/dev/serial0"),
    serialBaudRate: Number(value("RELAYHUB_SERIAL_BAUD_RATE", "115200")),
    powerKeyGpio: optionalNumber(value("RELAYHUB_POWER_KEY_GPIO")),
    simcomCnmp: optionalNumber(value("RELAYHUB_SIMCOM_CNMP", "2")),
    simcomCmnb: optionalNumber(value("RELAYHUB_SIMCOM_CMNB", "1")),
    heartbeatSeconds: Number(value("RELAYHUB_HEARTBEAT_SECONDS", "180")),
    pollSeconds: Number(value("RELAYHUB_POLL_SECONDS", "10")),
    inboundPollSeconds: Number(value("RELAYHUB_INBOUND_POLL_SECONDS", "60")),
    modemResetFailureThreshold: Number(value("RELAYHUB_MODEM_RESET_FAILURE_THRESHOLD", "5")),
    processRestartFailureThreshold: Number(value("RELAYHUB_PROCESS_RESTART_FAILURE_THRESHOLD", "10")),
    resetModemAfterSend: booleanValue(value("RELAYHUB_RESET_MODEM_AFTER_SEND", "false")),
    modemTrace: booleanValue(value("RELAYHUB_MODEM_TRACE", "false")),
    logLevel: value("RELAYHUB_LOG_LEVEL", "info") as GatewayConfig["logLevel"]
  };
}

function packageVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    return typeof packageJson.version === "string" ? packageJson.version : "unknown";
  } catch {
    return "unknown";
  }
}

function optionalNumber(value: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: string) {
  return /^(1|true|yes|on)$/i.test(value);
}

function parseEnv(input: string) {
  const values: Record<string, string> = {};
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
  return values;
}
