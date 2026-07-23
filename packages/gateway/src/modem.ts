import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SerialPort } from "serialport";
import type { GatewayConfig } from "./config.js";
import { normalizePhoneNumber } from "./phone.js";

const execFileAsync = promisify(execFile);
type ModemTrace = (eventType: string, context: Record<string, unknown>) => void;

export type SendResult = {
  submitted: boolean;
  response: string;
  messageReference?: number;
};

export type DeliveryReport = {
  messageReference: number;
  recipient?: string;
  serviceCenterTimestamp?: string;
  dischargeTime?: string;
  statusCode: number;
  normalizedStatus: "delivered" | "pending" | "undelivered" | "unknown";
  rawReport: string;
  receivedAt: string;
};

export type InboundSms = {
  modemIndex: number;
  from: string;
  body: string;
  receivedAt: string;
  messageStatus?: string;
  serviceCenter?: string;
};

export type SignalQuality = {
  level: "excellent" | "good" | "fair" | "poor" | "unknown";
  label: string;
  csq: number | null;
  rssiDbm: number | null;
  raw: string;
};

export interface Modem {
  initialize?(): Promise<void>;
  reset?(): Promise<void>;
  hardReset?(): Promise<void>;
  getSignalQuality?(): Promise<SignalQuality>;
  sendSms(to: string, body: string): Promise<SendResult>;
  listUnreadSms?(): Promise<InboundSms[]>;
  listDeliveryReports?(): Promise<DeliveryReport[]>;
  deleteSms?(modemIndex: number): Promise<void>;
}

export class ModemError extends Error {
  constructor(
    message: string,
    readonly transcript: string
  ) {
    super(message);
  }
}

export class MockModem implements Modem {
  async initialize() {
    return;
  }

  async reset() {
    return;
  }

  async hardReset() {
    return;
  }

  async getSignalQuality(): Promise<SignalQuality> {
    return signalFromCsq(24, "mock");
  }

  async sendSms(to: string, body: string): Promise<SendResult> {
    await sleep(500);
    return {
      submitted: true,
      response: `MOCK_SUBMITTED to=${to} chars=${body.length}`
    };
  }

  async listUnreadSms(): Promise<InboundSms[]> {
    return [];
  }

  async listDeliveryReports(): Promise<DeliveryReport[]> {
    return [];
  }

  async deleteSms() {
    return;
  }
}

export class Sim7070Modem implements Modem {
  private port?: SerialPort;
  private buffer = "";
  private initialized = false;
  private currentBaudRate?: number;
  private operationQueue: Promise<void> = Promise.resolve();
  private deliveryReports: DeliveryReport[] = [];
  private unsolicitedLineBuffer = "";

  constructor(
    private readonly config: GatewayConfig,
    private readonly binding?: unknown,
    private readonly trace?: ModemTrace
  ) {}

  async initialize() {
    return this.withSerialLock(() => this.initializeUnlocked());
  }

  private async initializeUnlocked() {
    await this.synchronizeAt();
    await this.command("ATE0", { expect: /OK/, timeoutMs: 3000 });
    await this.command("AT+CMEE=2", { expect: /OK/, timeoutMs: 3000 });
    await this.command("AT+CPIN?", { expect: /\+CPIN:\s*READY[\s\S]*OK/, timeoutMs: 5000 });

    await this.setNetworkMode();
    await this.ensureFullFunctionality();
    await this.tryCommand("AT+COPS=0,0", { expect: /OK|ERROR/, timeoutMs: 5000 });
    await this.waitForSignalQuality();
    await this.tryCommand("AT+COPS?", { expect: /\+COPS:[\s\S]*OK|ERROR/, timeoutMs: 5000 });
    await this.tryCommand("AT+CEREG?", { expect: /\+CEREG:[\s\S]*OK|ERROR/, timeoutMs: 5000 });
    await this.tryCommand("AT+CSCA?", { expect: /\+CSCA:[\s\S]*OK|ERROR/, timeoutMs: 5000 });

    if (this.config.apn) {
      await this.configureApn();
    }

    await this.command("AT+CMGF=1", { expect: /OK/, timeoutMs: 3000 });
    await this.command('AT+CSCS="GSM"', { expect: /OK/, timeoutMs: 3000 });
    await this.tryCommand("AT+CPMS?", { expect: /\+CPMS:[\s\S]*OK|ERROR/, timeoutMs: 3000 });
    const statusReportMode = await this.tryCommand("AT+CSMP=49,167,0,0", { expect: /OK|ERROR/, timeoutMs: 3000 });
    const statusReportRouting = await this.tryCommand("AT+CNMI=2,1,0,1,0", { expect: /OK|ERROR/, timeoutMs: 3000 });
    this.trace?.("modem_delivery_reports_configured", {
      requested: /OK/.test(statusReportMode) && /OK/.test(statusReportRouting),
      csmp: compactTranscript(statusReportMode),
      cnmi: compactTranscript(statusReportRouting)
    });
    this.initialized = true;
  }

  async reset() {
    return this.withSerialLock(() => this.resetUnlocked());
  }

  private async resetUnlocked() {
    this.initialized = false;
    await this.close();
  }

  async hardReset() {
    return this.withSerialLock(async () => {
      await this.resetUnlocked();
      await this.powerOn();
      await sleep(2000);
    });
  }

  async getSignalQuality(): Promise<SignalQuality> {
    return this.withSerialLock(async () => {
    const response = await this.tryCommand("AT+CSQ", { expect: /\+CSQ:\s*(\d+),[\s\S]*OK/, timeoutMs: 3000 });
    const match = response.match(/\+CSQ:\s*(\d+),/);
    const csq = match ? Number(match[1]) : null;
    return signalFromCsq(csq, compactTranscript(response));
    });
  }

  async sendSms(to: string, body: string): Promise<SendResult> {
    return this.withSerialLock(async () => {
    if (!this.initialized) {
      await this.initializeUnlocked();
    }

    const normalizedTo = normalizePhoneNumber(to);
    await this.write(`AT+CMGS="${escapeAtString(normalizedTo)}"\r`);
    const prompt = await this.readUntil(/>\s*$/, 10000, `AT+CMGS prompt for ${normalizedTo}`);
    if (/(\bERROR\b|\+CMS ERROR:|\+CME ERROR:)/.test(prompt)) {
      throw new ModemError(`SIM7070G rejected SMS recipient ${normalizedTo}`, prompt);
    }
    if (!prompt.includes(">")) {
      throw new ModemError("SIM7070G did not provide SMS prompt", prompt);
    }

    this.trace?.("modem_write_sms_body", { length: body.length });
    await this.write(`${body}\x1a`, { trace: false });
    const response = await this.readUntil(
      /\+CMGS:\s*\d+[\s\S]*OK|ERROR|\+CMS ERROR:|\+CME ERROR:/,
      60000,
      "SMS carrier submission"
    );
    if (!/\+CMGS:\s*\d+[\s\S]*OK/.test(response)) {
      throw new ModemError("SIM7070G did not confirm carrier submission", response);
    }

    return {
      submitted: true,
      response: compactTranscript(response),
      messageReference: Number(response.match(/\+CMGS:\s*(\d+)/)?.[1])
    };
    });
  }

  async listUnreadSms(): Promise<InboundSms[]> {
    return this.withSerialLock(async () => {
    if (!this.initialized) {
      await this.initializeUnlocked();
    }

    const response = await this.command('AT+CMGL="REC UNREAD"', { expect: /OK|ERROR/, timeoutMs: 10000 });
    return parseCmgl(response);
    });
  }

  async listDeliveryReports(): Promise<DeliveryReport[]> {
    return this.withSerialLock(async () => {
      if (!this.initialized) await this.initializeUnlocked();
      const reports = this.deliveryReports;
      this.deliveryReports = [];
      return reports;
    });
  }

  async deleteSms(modemIndex: number): Promise<void> {
    return this.withSerialLock(async () => {
    if (!this.initialized) {
      await this.initializeUnlocked();
    }
    await this.command(`AT+CMGD=${modemIndex}`, { expect: /OK/, timeoutMs: 5000 });
    });
  }

  private async withSerialLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue;
    let release!: () => void;
    this.operationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async waitForSignalQuality() {
    let last = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      last = await this.tryCommand("AT+CSQ", { expect: /\+CSQ:\s*(\d+),[\s\S]*OK/, timeoutMs: 3000 });
      const match = last.match(/\+CSQ:\s*(\d+),/);
      const rssi = match ? Number(match[1]) : 99;
      if (rssi !== 99) return;
      await sleep(3000);
    }
    // Some SIMCom modules report RSSI 99 while still completing registration later.
    // Registration is the authoritative MVP gate, so do not fail solely on CSQ.
  }

  private async ensureFullFunctionality() {
    const response = await this.command("AT+CFUN?", { expect: /\+CFUN:[\s\S]*OK|ERROR/, timeoutMs: 3000 });
    if (/\+CFUN:\s*1/.test(response)) return;
    await this.command("AT+CFUN=1", { expect: /OK/, timeoutMs: 5000 });
    await sleep(2000);
  }

  private async setNetworkMode() {
    const targetCnmp = this.config.simcomCnmp;
    const targetCmnb = this.config.simcomCmnb;

    const cnmp = await this.tryCommand("AT+CNMP?", { expect: /\+CNMP:\s*\d+[\s\S]*OK|ERROR/, timeoutMs: 3000 });
    if (targetCnmp !== undefined && cnmp && !new RegExp(`\\+CNMP:\\s*${targetCnmp}\\b`).test(cnmp)) {
      const updated = await this.tryCommand(`AT+CNMP=${targetCnmp}`, { expect: /OK|ERROR/, timeoutMs: 5000 });
      if (/OK/.test(updated)) {
        this.trace?.("modem_network_mode_updated", { command: "AT+CNMP", value: targetCnmp });
      }
    }

    const cmnb = await this.tryCommand("AT+CMNB?", { expect: /\+CMNB:\s*\d+[\s\S]*OK|ERROR/, timeoutMs: 3000 });
    if (targetCmnb !== undefined && cmnb && !new RegExp(`\\+CMNB:\\s*${targetCmnb}\\b`).test(cmnb)) {
      const updated = await this.tryCommand(`AT+CMNB=${targetCmnb}`, { expect: /OK|ERROR/, timeoutMs: 5000 });
      if (/OK/.test(updated)) {
        this.trace?.("modem_network_mode_updated", { command: "AT+CMNB", value: targetCmnb });
      }
    }
  }

  private async configureApn() {
    const current = await this.command("AT+CGDCONT?", { expect: /OK|ERROR/, timeoutMs: 5000 });
    if (this.config.apn && current.includes(this.config.apn)) return;
    await this.command(`AT+CGDCONT=1,"IP","${escapeAtString(this.config.apn || "")}"`, {
      expect: /OK/,
      timeoutMs: 5000
    });
  }

  private async command(command: string, options: { expect: RegExp; timeoutMs: number }) {
    await this.write(`${command}\r`);
    const response = await this.readUntil(options.expect, options.timeoutMs, command);
    if (/(\bERROR\b|\+CMS ERROR:|\+CME ERROR:)/.test(response)) {
      throw new ModemError(`SIM7070G command failed: ${command}`, response);
    }
    return response;
  }

  private async tryCommand(command: string, options: { expect: RegExp; timeoutMs: number }) {
    try {
      return await this.command(command, options);
    } catch {
      return "";
    }
  }

  private async open() {
    if (this.port?.isOpen) return;
    await this.openAtBaud(this.config.serialBaudRate);
  }

  private async openAtBaud(baudRate: number) {
    if (this.port?.isOpen && this.currentBaudRate === baudRate) return;
    await this.close();

    const options = {
      path: this.config.serialDevice,
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      rtscts: false,
      autoOpen: false
    } as Record<string, unknown>;
    if (this.binding) {
      options.binding = this.binding;
    }
    this.port = new SerialPort(options as any);
    this.port.on("data", (chunk: Buffer) => {
      const value = chunk.toString("utf8");
      this.buffer += value;
      this.captureUnsolicitedLines(value);
    });
    await new Promise<void>((resolve, reject) => {
      this.port?.open((error) => (error ? reject(error) : resolve()));
    });
    this.currentBaudRate = baudRate;
    this.trace?.("modem_serial_opened", {
      device: this.config.serialDevice,
      baudRate
    });
    await new Promise<void>((resolve, reject) => {
      this.port?.set({ dtr: true, rts: true }, (error) => (error ? reject(error) : resolve()));
    }).catch(() => undefined);
    await sleep(500);
    this.buffer = "";
  }

  private captureUnsolicitedLines(value: string) {
    this.unsolicitedLineBuffer += value.replace(/\r/g, "");
    const lines = this.unsolicitedLineBuffer.split("\n");
    this.unsolicitedLineBuffer = lines.pop() || "";
    for (const line of lines) {
      const report = parseDeliveryReportLine(line.trim());
      if (report) {
        this.deliveryReports.push(report);
        this.trace?.("modem_delivery_report_received", {
          messageReference: report.messageReference,
          statusCode: report.statusCode,
          normalizedStatus: report.normalizedStatus
        });
      }
    }
  }

  private async close() {
    if (!this.port) return;
    const port = this.port;
    this.port = undefined;
    this.currentBaudRate = undefined;
    this.buffer = "";
    if (!port.isOpen) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        port.destroy();
        resolve();
      }, 3000);
      port.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
    this.trace?.("modem_serial_closed", {});
  }

  private async synchronizeAt() {
    const baudRates = uniqueNumbers([this.config.serialBaudRate, 9600, 115200, 57600, 38400]);
    const quickSync = await this.trySynchronizeBauds(baudRates, 1, "AT sync");
    if (quickSync.ok) return quickSync.response;

    if (this.config.powerKeyGpio !== undefined && !this.binding) {
      await this.powerOn();
      const poweredSync = await this.trySynchronizeUntil(baudRates, Date.now() + 45_000, "AT sync after PWRKEY");
      if (poweredSync.ok) return poweredSync.response;
      throw new ModemError("Timed out waiting for SIM7070G response after PWRKEY", poweredSync.lastTranscript);
    }

    const extendedSync = await this.trySynchronizeBauds(baudRates, 5, "AT sync extended");
    if (extendedSync.ok) return extendedSync.response;

    throw new ModemError("Timed out waiting for SIM7070G response", extendedSync.lastTranscript || quickSync.lastTranscript);
  }

  private async trySynchronizeBauds(baudRates: number[], attemptsPerBaud: number, label: string) {
    let lastTranscript = "";
    for (const baudRate of baudRates) {
      const result = await this.trySynchronizeBaud(baudRate, attemptsPerBaud, label);
      if (result.ok) return result;
      lastTranscript = result.lastTranscript || lastTranscript;
    }
    return { ok: false as const, lastTranscript };
  }

  private async trySynchronizeUntil(baudRates: number[], deadline: number, label: string) {
    let lastTranscript = "";
    let cycle = 0;
    while (Date.now() < deadline) {
      cycle += 1;
      for (const baudRate of baudRates) {
        if (Date.now() >= deadline) break;
        const result = await this.trySynchronizeBaud(baudRate, 1, label, { cycle });
        if (result.ok) return result;
        lastTranscript = result.lastTranscript || lastTranscript;
      }
    }
    return { ok: false as const, lastTranscript };
  }

  private async trySynchronizeBaud(baudRate: number, attempts: number, label: string, context: Record<string, unknown> = {}) {
    let lastTranscript = "";
    await this.openAtBaud(baudRate);
    this.buffer = "";

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        this.trace?.("modem_sync_attempt", { ...context, label, baudRate, attempt: attempt + 1 });
        await this.rawWrite("AT\r");
        return {
          ok: true as const,
          response: await this.readUntil(/OK/, 1000, `${label} at ${baudRate}`)
        };
      } catch (error) {
        if (error instanceof ModemError) lastTranscript = error.transcript;
      }
    }

    return { ok: false as const, lastTranscript };
  }

  private async powerOn() {
    if (this.config.powerKeyGpio === undefined || this.binding) return;
    this.trace?.("modem_power_key_started", { gpio: this.config.powerKeyGpio });
    await gpioWrite(this.config.powerKeyGpio, 1);
    await sleep(2000);
    await gpioWrite(this.config.powerKeyGpio, 0);
    await sleep(5000);
    this.trace?.("modem_power_key_complete", { gpio: this.config.powerKeyGpio });
  }

  private async write(value: string, options: { trace?: boolean } = {}) {
    await this.open();
    this.buffer = "";
    if (options.trace !== false) {
      this.trace?.("modem_write", { value: printableCommand(value) });
    }
    await this.rawWrite(value);
  }

  private async rawWrite(value: string) {
    await new Promise<void>((resolve, reject) => {
      this.port?.write(value, (error) => {
        if (error) reject(error);
        else this.port?.drain((drainError) => (drainError ? reject(drainError) : resolve()));
      });
    });
  }

  private async readUntil(pattern: RegExp, timeoutMs: number, label = "SIM7070G response") {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (pattern.test(this.buffer)) {
        this.trace?.("modem_read_matched", {
          label,
          response: compactTranscript(this.buffer)
        });
        return this.buffer;
      }
      if (/(\bERROR\b|\+CMS ERROR:|\+CME ERROR:)/.test(this.buffer)) {
        this.trace?.("modem_read_error", {
          label,
          response: compactTranscript(this.buffer)
        });
        return this.buffer;
      }
      await sleep(50);
    }
    this.trace?.("modem_read_timeout", {
      label,
      response: compactTranscript(this.buffer)
    });
    throw new ModemError(`Timed out waiting for ${label}`, this.buffer);
  }
}

export function createModem(config: GatewayConfig, trace?: ModemTrace): Modem {
  return config.modemMode === "sim7070" ? new Sim7070Modem(config, undefined, trace) : new MockModem();
}

function escapeAtString(value: string) {
  return value.replace(/"/g, '\\"');
}

function compactTranscript(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

function printableCommand(value: string) {
  if (value.includes("\x1a")) return `[SMS_BODY_CTRL_Z length=${value.length - 1}]`;
  return value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueNumbers(values: number[]) {
  return values.filter((value, index, array) => Number.isFinite(value) && array.indexOf(value) === index);
}

function signalFromCsq(csq: number | null, raw: string): SignalQuality {
  if (csq === null || !Number.isFinite(csq) || csq === 99) {
    return {
      level: "unknown",
      label: "Unknown",
      csq: csq === null || !Number.isFinite(csq) ? null : csq,
      rssiDbm: null,
      raw
    };
  }

  const rssiDbm = -113 + 2 * csq;
  if (rssiDbm >= -75) return { level: "excellent", label: "Excellent", csq, rssiDbm, raw };
  if (rssiDbm >= -85) return { level: "good", label: "Good", csq, rssiDbm, raw };
  if (rssiDbm >= -95) return { level: "fair", label: "Fair", csq, rssiDbm, raw };
  return { level: "poor", label: "Poor", csq, rssiDbm, raw };
}

function parseCmgl(response: string): InboundSms[] {
  const normalized = response.replace(/\r/g, "");
  const lines = normalized.split("\n");
  const messages: InboundSms[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].trim();
    if (!header.startsWith("+CMGL:")) continue;

    const fields = parseCsvLine(header.replace(/^\+CMGL:\s*/, ""));
    const modemIndex = Number(fields[0]);
    const messageStatus = fields[1];
    const from = fields[2];
    const serviceCenter = fields[4] || undefined;
    const receivedAtRaw = fields[5] || "";
    const bodyLines: string[] = [];

    index += 1;
    while (index < lines.length && !lines[index].startsWith("+CMGL:") && lines[index].trim() !== "OK") {
      bodyLines.push(lines[index]);
      index += 1;
    }
    index -= 1;

    if (Number.isFinite(modemIndex) && from && bodyLines.length) {
      messages.push({
        modemIndex,
        from,
        body: bodyLines.join("\n").trim(),
        receivedAt: parseSimTimestamp(receivedAtRaw).toISOString(),
        messageStatus,
        serviceCenter
      });
    }
  }

  return messages;
}

function parseCsvLine(line: string) {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

export function parseDeliveryReportLine(line: string): DeliveryReport | null {
  if (!line.startsWith("+CDS:")) return null;
  const fields = parseCsvLine(line.replace(/^\+CDS:\s*/, ""));
  const messageReference = Number(fields[1]);
  const recipient = fields.length >= 7 ? fields[2] || undefined : undefined;
  const statusCode = Number(fields.at(-1));
  if (!Number.isInteger(messageReference) || !Number.isInteger(statusCode)) return null;
  const dateFields = fields.filter((field) => /^\d{2}\/\d{2}\/\d{2},/.test(field));
  return {
    messageReference,
    recipient,
    serviceCenterTimestamp: dateFields[0] ? parseSimTimestamp(dateFields[0]).toISOString() : undefined,
    dischargeTime: dateFields[1] ? parseSimTimestamp(dateFields[1]).toISOString() : undefined,
    statusCode,
    normalizedStatus: normalizeDeliveryStatus(statusCode),
    rawReport: line,
    receivedAt: new Date().toISOString()
  };
}

export function normalizeDeliveryStatus(statusCode: number): DeliveryReport["normalizedStatus"] {
  if (!Number.isInteger(statusCode) || statusCode < 0 || statusCode > 255) return "unknown";
  if (statusCode <= 31) return "delivered";
  if (statusCode <= 63) return "pending";
  if (statusCode <= 127) return "undelivered";
  return "unknown";
}

function parseSimTimestamp(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2}),(\d{2}):(\d{2}):(\d{2})([+-]\d{2})?$/);
  if (!match) return new Date();

  const [, year, month, day, hour, minute, second, quarterOffset] = match;
  const offsetMinutes = quarterOffset ? Number(quarterOffset) * 15 : 0;
  const utc = Date.UTC(
    2000 + Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  return new Date(utc - offsetMinutes * 60_000);
}

export async function gpioWrite(pin: number, value: 0 | 1) {
  if (await gpioWriteWithCommand("pinctrl", ["set", String(pin), "op", value ? "dh" : "dl"])) return;
  if (await gpioWriteWithCommand("raspi-gpio", ["set", String(pin), "op", value ? "dh" : "dl"])) return;
  throw new Error(`Unable to write GPIO ${pin}; pinctrl and raspi-gpio are unavailable or failed`);
}

async function gpioWriteWithCommand(command: string, args: string[]) {
  try {
    await execFileAsync(command, args, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}
