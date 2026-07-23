import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error serialport's package exports hide binding-mock types from TS bundler resolution.
import { MockBinding } from "@serialport/binding-mock";
import { Sim7070Modem, ModemError, gpioWrite, parseDeliveryReportLine } from "../packages/gateway/src/modem";
import { normalizePhoneNumber } from "../packages/gateway/src/phone";
import type { GatewayConfig } from "../packages/gateway/src/config";

const path = "/dev/relayhub-test";

function config(): GatewayConfig {
  return {
    hubUrl: "http://localhost:3000",
    apiKey: "test",
    softwareVersion: "test",
    packageUrl: "https://sns.digicolony.net/gateway.tar.gz",
    installDir: "/opt/relayhub-gateway",
    serviceName: "relayhub-gateway",
    apn: "wholesale",
    carrier: "Tello",
    modemMode: "sim7070",
    serialDevice: path,
    serialBaudRate: 115200,
    simcomCnmp: 2,
    simcomCmnb: 1,
    heartbeatSeconds: 180,
    pollSeconds: 10,
    inboundPollSeconds: 60,
    modemResetFailureThreshold: 5,
    processRestartFailureThreshold: 10,
    resetModemAfterSend: false,
    modemTrace: false,
    logLevel: "info"
  };
}

test("SIM7070 modem initializes and waits for +CMGS OK", async () => {
  MockBinding.reset();
  MockBinding.createPort(path, { echo: false, record: true });
  const modem = new Sim7070Modem(config(), MockBinding);

  const responder = respondToCommands(modem, [
    ["AT\r", "\r\nOK\r\n"],
    ["ATE0\r", "\r\nOK\r\n"],
    ["AT+CMEE=2\r", "\r\nOK\r\n"],
    ["AT+CPIN?\r", "\r\n+CPIN: READY\r\nOK\r\n"],
    ["AT+CNMP?\r", "\r\n+CNMP: 2\r\nOK\r\n"],
    ["AT+CMNB?\r", "\r\n+CMNB: 1\r\nOK\r\n"],
    ["AT+CFUN?\r", "\r\n+CFUN: 1\r\nOK\r\n"],
    ["AT+COPS=0,0\r", "\r\nOK\r\n"],
    ["AT+CSQ\r", "\r\n+CSQ: 20,99\r\nOK\r\n"],
    ["AT+COPS?\r", "\r\n+COPS: 0,0,\"Tello\",7\r\nOK\r\n"],
    ["AT+CEREG?\r", "\r\n+CEREG: 0,1\r\nOK\r\n"],
    ["AT+CSCA?\r", "\r\n+CSCA: \"+12063130004\",145\r\nOK\r\n"],
    ["AT+CGDCONT?\r", "\r\nOK\r\n"],
    ['AT+CGDCONT=1,"IP","wholesale"\r', "\r\nOK\r\n"],
    ["AT+CMGF=1\r", "\r\nOK\r\n"],
    ['AT+CSCS="GSM"\r', "\r\nOK\r\n"],
    ["AT+CPMS?\r", "\r\n+CPMS: \"SM\",0,50,\"SM\",0,50,\"SM\",0,50\r\nOK\r\n"],
    ['AT+CMGS="+15551234567"\r', "\r\n> "],
    ["hello\x1a", "\r\n+CMGS: 42\r\nOK\r\n"]
  ]);

  await modem.initialize();
  const result = await modem.sendSms("+15551234567", "hello");
  await responder;

  assert.equal(result.submitted, true);
  assert.match(result.response, /\+CMGS: 42/);
  assert.equal(result.messageReference, 42);
});

test("SIM7070 delivery reports normalize carrier status and preserve message reference", () => {
  const delivered = parseDeliveryReportLine(
    '+CDS: 49,42,"+15551234567",145,"26/07/22,10:00:00-16","26/07/22,10:00:04-16",0'
  );
  const failed = parseDeliveryReportLine(
    '+CDS: 49,43,"+15551234567",145,"26/07/22,10:00:00-16","26/07/22,10:01:04-16",64'
  );
  assert.equal(delivered?.messageReference, 42);
  assert.equal(delivered?.recipient, "+15551234567");
  assert.equal(delivered?.normalizedStatus, "delivered");
  assert.equal(failed?.normalizedStatus, "undelivered");
});

test("SIM7070 modem trains autobaud with repeated AT commands", async () => {
  MockBinding.reset();
  MockBinding.createPort(path, { echo: false, record: true });
  const traces: Array<{ eventType: string; context: Record<string, unknown> }> = [];
  const modem = new Sim7070Modem(config(), MockBinding, (eventType, context) => traces.push({ eventType, context }));

  const responder = respondAfterTrace(traces, (trace) => trace.eventType === "modem_sync_attempt" && trace.context.baudRate === 9600, modem, [
    ["ATE0\r", "\r\nOK\r\n"],
    ["AT+CMEE=2\r", "\r\nOK\r\n"],
    ["AT+CPIN?\r", "\r\n+CPIN: READY\r\nOK\r\n"],
    ["AT+CNMP?\r", "\r\n+CNMP: 2\r\nOK\r\n"],
    ["AT+CMNB?\r", "\r\n+CMNB: 1\r\nOK\r\n"],
    ["AT+CFUN?\r", "\r\n+CFUN: 1\r\nOK\r\n"],
    ["AT+COPS=0,0\r", "\r\nOK\r\n"],
    ["AT+CSQ\r", "\r\n+CSQ: 20,99\r\nOK\r\n"],
    ["AT+COPS?\r", "\r\n+COPS: 0,0,\"Tello\",7\r\nOK\r\n"],
    ["AT+CEREG?\r", "\r\n+CEREG: 0,1\r\nOK\r\n"],
    ["AT+CSCA?\r", "\r\n+CSCA: \"+12063130004\",145\r\nOK\r\n"],
    ["AT+CGDCONT?\r", "\r\n+CGDCONT: 1,\"IP\",\"wholesale\"\r\nOK\r\n"],
    ["AT+CMGF=1\r", "\r\nOK\r\n"],
    ['AT+CSCS="GSM"\r', "\r\nOK\r\n"],
    ["AT+CPMS?\r", "\r\n+CPMS: \"SM\",0,50,\"SM\",0,50,\"SM\",0,50\r\nOK\r\n"]
  ]);

  await Promise.all([modem.initialize(), responder]);
  assert.equal(traces.some((trace) => trace.eventType === "modem_sync_attempt" && trace.context.baudRate === 115200), true);
  assert.equal(traces.some((trace) => trace.eventType === "modem_sync_attempt" && trace.context.baudRate === 9600), true);
});

test("SIM7070 modem moves through baud rates quickly during sync", async () => {
  MockBinding.reset();
  MockBinding.createPort(path, { echo: false, record: true });
  const traces: Array<{ eventType: string; context: Record<string, unknown> }> = [];
  const modem = new Sim7070Modem(config(), MockBinding, (eventType, context) => traces.push({ eventType, context }));

  const responder = respondAfterTrace(traces, (trace) => trace.eventType === "modem_sync_attempt" && trace.context.baudRate === 9600, modem, [
    ["ATE0\r", "\r\nOK\r\n"],
    ["AT+CMEE=2\r", "\r\nOK\r\n"],
    ["AT+CPIN?\r", "\r\n+CPIN: READY\r\nOK\r\n"],
    ["AT+CNMP?\r", "\r\n+CNMP: 2\r\nOK\r\n"],
    ["AT+CMNB?\r", "\r\n+CMNB: 1\r\nOK\r\n"],
    ["AT+CFUN?\r", "\r\n+CFUN: 1\r\nOK\r\n"],
    ["AT+COPS=0,0\r", "\r\nOK\r\n"],
    ["AT+CSQ\r", "\r\n+CSQ: 20,99\r\nOK\r\n"],
    ["AT+COPS?\r", "\r\n+COPS: 0,0,\"Tello\",7\r\nOK\r\n"],
    ["AT+CEREG?\r", "\r\n+CEREG: 0,1\r\nOK\r\n"],
    ["AT+CSCA?\r", "\r\n+CSCA: \"+12063130004\",145\r\nOK\r\n"],
    ["AT+CGDCONT?\r", "\r\n+CGDCONT: 1,\"IP\",\"wholesale\"\r\nOK\r\n"],
    ["AT+CMGF=1\r", "\r\nOK\r\n"],
    ['AT+CSCS="GSM"\r', "\r\nOK\r\n"],
    ["AT+CPMS?\r", "\r\n+CPMS: \"SM\",0,50,\"SM\",0,50,\"SM\",0,50\r\nOK\r\n"]
  ]);

  await Promise.all([modem.initialize(), responder]);
  assert.equal(traces.filter((trace) => trace.eventType === "modem_sync_attempt" && trace.context.baudRate === 115200).length, 1);
  assert.equal(traces.some((trace) => trace.eventType === "modem_sync_attempt" && trace.context.baudRate === 9600), true);
});

test("SIM7070 modem does not reboot after updating network mode", async () => {
  MockBinding.reset();
  MockBinding.createPort(path, { echo: false, record: true });
  const traces: Array<{ eventType: string; context: Record<string, unknown> }> = [];
  const modem = new Sim7070Modem({ ...config(), simcomCnmp: 38 }, MockBinding, (eventType, context) =>
    traces.push({ eventType, context })
  );

  const responder = respondToCommands(modem, [
    ["AT\r", "\r\nOK\r\n"],
    ["ATE0\r", "\r\nOK\r\n"],
    ["AT+CMEE=2\r", "\r\nOK\r\n"],
    ["AT+CPIN?\r", "\r\n+CPIN: READY\r\nOK\r\n"],
    ["AT+CNMP?\r", "\r\n+CNMP: 2\r\nOK\r\n"],
    ["AT+CNMP=38\r", "\r\nOK\r\n"],
    ["AT+CMNB?\r", "\r\n+CMNB: 1\r\nOK\r\n"],
    ["AT+CFUN?\r", "\r\n+CFUN: 1\r\nOK\r\n"],
    ["AT+COPS=0,0\r", "\r\nOK\r\n"],
    ["AT+CSQ\r", "\r\n+CSQ: 20,99\r\nOK\r\n"],
    ["AT+COPS?\r", "\r\n+COPS: 0,0,\"Tello\",7\r\nOK\r\n"],
    ["AT+CEREG?\r", "\r\n+CEREG: 0,1\r\nOK\r\n"],
    ["AT+CSCA?\r", "\r\n+CSCA: \"+12063130004\",145\r\nOK\r\n"],
    ["AT+CGDCONT?\r", "\r\n+CGDCONT: 1,\"IP\",\"wholesale\"\r\nOK\r\n"],
    ["AT+CMGF=1\r", "\r\nOK\r\n"],
    ['AT+CSCS="GSM"\r', "\r\nOK\r\n"],
    ["AT+CPMS?\r", "\r\n+CPMS: \"SM\",0,50,\"SM\",0,50,\"SM\",0,50\r\nOK\r\n"]
  ]);

  await Promise.all([modem.initialize(), responder]);
  const port = await waitForMockPort(modem);
  assert.equal(port.recording.toString("utf8").includes("AT+CFUN=1,1\r"), false);
  assert.equal(traces.some((trace) => trace.eventType === "modem_network_mode_updated"), true);
});

test("SIM7070 modem waits for full CMNB query response", async () => {
  MockBinding.reset();
  MockBinding.createPort(path, { echo: false, record: true });
  const traces: Array<{ eventType: string; context: Record<string, unknown> }> = [];
  const modem = new Sim7070Modem(config(), MockBinding, (eventType, context) => traces.push({ eventType, context }));

  const responder = respondToCommands(modem, [
    ["AT\r", "\r\nOK\r\n"],
    ["ATE0\r", "\r\nOK\r\n"],
    ["AT+CMEE=2\r", "\r\nOK\r\n"],
    ["AT+CPIN?\r", "\r\n+CPIN: READY\r\nOK\r\n"],
    ["AT+CNMP?\r", "\r\n+CNMP: 2\r\nOK\r\n"],
    ["AT+CMNB?\r", "\r\n+CMNB:"],
    ["AT+CMNB?", " 1\r\nOK\r\n"],
    ["AT+CFUN?\r", "\r\n+CFUN: 1\r\nOK\r\n"],
    ["AT+COPS=0,0\r", "\r\nOK\r\n"],
    ["AT+CSQ\r", "\r\n+CSQ: 20,99\r\nOK\r\n"],
    ["AT+COPS?\r", "\r\n+COPS: 0,0,\"Tello\",7\r\nOK\r\n"],
    ["AT+CEREG?\r", "\r\n+CEREG: 0,1\r\nOK\r\n"],
    ["AT+CSCA?\r", "\r\n+CSCA: \"+12063130004\",145\r\nOK\r\n"],
    ["AT+CGDCONT?\r", "\r\n+CGDCONT: 1,\"IP\",\"wholesale\"\r\nOK\r\n"],
    ["AT+CMGF=1\r", "\r\nOK\r\n"],
    ['AT+CSCS="GSM"\r', "\r\nOK\r\n"],
    ["AT+CPMS?\r", "\r\n+CPMS: \"SM\",0,50,\"SM\",0,50,\"SM\",0,50\r\nOK\r\n"]
  ]);

  await Promise.all([modem.initialize(), responder]);
  const cmnbTrace = traces.find((trace) => trace.eventType === "modem_read_matched" && trace.context.label === "AT+CMNB?");
  assert.match(String(cmnbTrace?.context.response), /\+CMNB: 1 \| OK/);
});

test("SIM7070 modem fails when SMS submission returns ERROR", async () => {
  MockBinding.reset();
  MockBinding.createPort(path, { echo: false, record: true });
  const modem = new Sim7070Modem({ ...config(), apn: undefined }, MockBinding);

  const responder = respondToCommands(modem, [
    ["AT\r", "\r\nOK\r\n"],
    ["ATE0\r", "\r\nOK\r\n"],
    ["AT+CMEE=2\r", "\r\nOK\r\n"],
    ["AT+CPIN?\r", "\r\n+CPIN: READY\r\nOK\r\n"],
    ["AT+CNMP?\r", "\r\n+CNMP: 2\r\nOK\r\n"],
    ["AT+CMNB?\r", "\r\n+CMNB: 1\r\nOK\r\n"],
    ["AT+CFUN?\r", "\r\n+CFUN: 1\r\nOK\r\n"],
    ["AT+COPS=0,0\r", "\r\nOK\r\n"],
    ["AT+CSQ\r", "\r\n+CSQ: 20,99\r\nOK\r\n"],
    ["AT+COPS?\r", "\r\n+COPS: 0,0,\"Tello\",7\r\nOK\r\n"],
    ["AT+CEREG?\r", "\r\n+CEREG: 0,1\r\nOK\r\n"],
    ["AT+CSCA?\r", "\r\n+CSCA: \"+12063130004\",145\r\nOK\r\n"],
    ["AT+CMGF=1\r", "\r\nOK\r\n"],
    ['AT+CSCS="GSM"\r', "\r\nOK\r\n"],
    ["AT+CPMS?\r", "\r\n+CPMS: \"SM\",0,50,\"SM\",0,50,\"SM\",0,50\r\nOK\r\n"],
    ['AT+CMGS="+15551234567"\r', "\r\n> "],
    ["hello\x1a", "\r\n+CMS ERROR: 500\r\n"]
  ]);

  await modem.initialize();
  await assert.rejects(() => modem.sendSms("+15551234567", "hello"), ModemError);
  await responder;
});

test("phone normalization removes hidden direction marks", () => {
  assert.equal(normalizePhoneNumber("‭+19542909026‬"), "+19542909026");
  assert.equal(normalizePhoneNumber("(954) 290-9026"), "+19542909026");
});

test("SIM7070 modem rejects invalid recipient without retryable prompt timeout", async () => {
  MockBinding.reset();
  MockBinding.createPort(path, { echo: false, record: true });
  const modem = new Sim7070Modem({ ...config(), apn: undefined }, MockBinding);

  const responder = respondToCommands(modem, [
    ["AT\r", "\r\nOK\r\n"],
    ["ATE0\r", "\r\nOK\r\n"],
    ["AT+CMEE=2\r", "\r\nOK\r\n"],
    ["AT+CPIN?\r", "\r\n+CPIN: READY\r\nOK\r\n"],
    ["AT+CNMP?\r", "\r\n+CNMP: 2\r\nOK\r\n"],
    ["AT+CMNB?\r", "\r\n+CMNB: 1\r\nOK\r\n"],
    ["AT+CFUN?\r", "\r\n+CFUN: 1\r\nOK\r\n"],
    ["AT+COPS=0,0\r", "\r\nOK\r\n"],
    ["AT+CSQ\r", "\r\n+CSQ: 20,99\r\nOK\r\n"],
    ["AT+COPS?\r", "\r\n+COPS: 0,0,\"Tello\",7\r\nOK\r\n"],
    ["AT+CEREG?\r", "\r\n+CEREG: 0,1\r\nOK\r\n"],
    ["AT+CSCA?\r", "\r\n+CSCA: \"+12063130004\",145\r\nOK\r\n"],
    ["AT+CMGF=1\r", "\r\nOK\r\n"],
    ['AT+CSCS="GSM"\r', "\r\nOK\r\n"],
    ["AT+CPMS?\r", "\r\n+CPMS: \"SM\",0,50,\"SM\",0,50,\"SM\",0,50\r\nOK\r\n"],
    ['AT+CMGS="+19542909026"\r', "\r\nERROR\r\n"]
  ]);

  await modem.initialize();
  await assert.rejects(
    () => modem.sendSms("‭+19542909026‬", "hello"),
    /SIM7070G rejected SMS recipient \+19542909026/
  );
  await responder;
});

test("GPIO write uses Raspberry Pi pinctrl tooling", async () => {
  const dir = await mkdtemp(join(tmpdir(), "relayhub-gpio-test-"));
  const command = join(dir, "pinctrl");
  const output = join(dir, "gpio-call");
  const previousPath = process.env.PATH;
  await writeFile(
    command,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > ${JSON.stringify(output)}\n`
  );
  await import("node:fs/promises").then(({ chmod }) => chmod(command, 0o755));
  process.env.PATH = `${dir}:${previousPath || ""}`;

  try {
    await gpioWrite(4, 1);
  } finally {
    process.env.PATH = previousPath;
  }

  const { readFile } = await import("node:fs/promises");
  assert.equal((await readFile(output, "utf8")).trim(), "set 4 op dh");
  await rm(dir, { recursive: true, force: true });
});

async function respondToCommands(modem: Sim7070Modem, pairs: Array<[string, string]>) {
  let seen = "";
  const autoResponded = new Set<string>();
  const deliveryConfigurationCommands = ["AT+CSMP=49,167,0,0\r", "AT+CNMI=2,1,0,1,0\r"];
  for (const [command, response] of pairs) {
    const port = await waitForMockPort(modem);
    const deadline = Date.now() + 5000;
    while (!seen.includes(command)) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for command ${JSON.stringify(command)}. Saw: ${JSON.stringify(seen)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
      seen = port.recording.toString("utf8");
      for (const configurationCommand of deliveryConfigurationCommands) {
        if (command !== configurationCommand && seen.includes(configurationCommand) && !autoResponded.has(configurationCommand)) {
          autoResponded.add(configurationCommand);
          port.emitData("\r\nOK\r\n");
        }
      }
    }
    port.emitData(response);
  }
}

async function respondAfterAtCount(modem: Sim7070Modem, count: number, pairs: Array<[string, string]>) {
  const port = await waitForMockPort(modem);
  const deadline = Date.now() + 5000;
  while ((port.recording.toString("utf8").match(/AT\r/g) || []).length < count) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${count} AT commands. Saw: ${JSON.stringify(port.recording.toString("utf8"))}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  port.emitData("\r\nOK\r\n");
  await respondToCommands(modem, pairs);
}

async function respondAfterTrace(
  traces: Array<{ eventType: string; context: Record<string, unknown> }>,
  predicate: (trace: { eventType: string; context: Record<string, unknown> }) => boolean,
  modem: Sim7070Modem,
  pairs: Array<[string, string]>
) {
  const deadline = Date.now() + 5000;
  while (!traces.some(predicate)) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for trace. Saw: ${JSON.stringify(traces)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const port = await waitForMockPort(modem);
  port.emitData("\r\nOK\r\n");
  await respondToCommands(modem, pairs);
}

async function waitForMockPort(modem: Sim7070Modem): Promise<any> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const serialPort = (modem as any).port;
    const binding = serialPort?.port;
    if (binding) return binding;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Mock serial port did not open");
}
