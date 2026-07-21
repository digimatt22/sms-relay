import { loadConfig } from "./config.js";
import { RelayHubApi } from "./api.js";
import { createModem } from "./modem.js";
import { redactPhone } from "./redact.js";

const config = loadConfig();

if (!config.apiKey) {
  console.error("RELAYHUB_GATEWAY_KEY is required");
  process.exit(1);
}

const api = new RelayHubApi(config);
let bufferedLogs: Array<{ level: string; eventType: string; message: string; context?: Record<string, unknown> }> = [];
const modem = createModem(
  config,
  config.modemTrace
    ? (eventType, context) => log("debug", "modem_trace", eventType, context)
    : undefined
);
let modemFailureCount = 0;
let inboundFailureCount = 0;
let nextInboundPollAt = 0;
let heartbeatInFlight = false;
let flushInFlight = false;

function log(level: "debug" | "info" | "warn" | "error", eventType: string, message: string, context: Record<string, unknown> = {}) {
  const entry = { level, eventType, message, context };
  bufferedLogs.push(entry);
  const contextText = Object.keys(context).length ? ` ${JSON.stringify(context)}` : "";
  console.log(`[${level}] ${eventType}: ${message}${contextText}`);
}

async function flushLogs() {
  if (flushInFlight) return;
  flushInFlight = true;
  const logs = bufferedLogs;
  bufferedLogs = [];
  try {
    await api.sendLogs(logs);
  } catch (error) {
    bufferedLogs = [...logs, ...bufferedLogs].slice(-500);
    console.error(error);
  } finally {
    flushInFlight = false;
  }
}

async function heartbeat() {
  if (heartbeatInFlight) return;
  heartbeatInFlight = true;
  try {
    let signalQuality: Record<string, unknown> = { level: "unknown", label: "Unknown" };
    try {
      signalQuality = (await modem.getSignalQuality?.()) || signalQuality;
    } catch (error) {
      signalQuality = {
        level: "unknown",
        label: "Unknown",
        error: error instanceof Error ? error.message : String(error)
      };
    }

    await api.heartbeat({
      modemMode: config.modemMode,
      serialDevice: config.serialDevice,
      serialBaudRate: config.serialBaudRate,
      signalQuality,
      bufferedLogs: bufferedLogs.length
    });
  } catch (error) {
    log("warn", "heartbeat_failed", error instanceof Error ? error.message : String(error));
  } finally {
    heartbeatInFlight = false;
  }
}

async function collectDiagnostics() {
  let signalQuality: Record<string, unknown> = { level: "unknown", label: "Unknown" };
  try {
    signalQuality = (await modem.getSignalQuality?.()) || signalQuality;
  } catch (error) {
    signalQuality = {
      level: "unknown",
      label: "Unknown",
      error: error instanceof Error ? error.message : String(error)
    };
  }

  return {
    hubUrl: config.hubUrl,
    modemMode: config.modemMode,
    serialDevice: config.serialDevice,
    serialBaudRate: config.serialBaudRate,
    carrier: config.carrier,
    apn: config.apn,
    heartbeatSeconds: config.heartbeatSeconds,
    pollSeconds: config.pollSeconds,
    inboundPollSeconds: config.inboundPollSeconds,
    modemFailureCount,
    inboundFailureCount,
    bufferedLogs: bufferedLogs.length,
    signalQuality
  };
}

async function processCommands() {
  const commands = await api.claimCommands();
  for (const command of commands) {
    log("info", "gateway_command_claimed", `Claimed command ${command.command_type}`, {
      commandId: command.id,
      commandType: command.command_type
    });
    try {
      const result = await executeCommand(command.command_type);
      await api.completeCommand(command.id, "completed", result);
      log("info", "gateway_command_completed", `Completed command ${command.command_type}`, {
        commandId: command.id,
        commandType: command.command_type
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await api.completeCommand(command.id, "failed", { error: message });
      log("error", "gateway_command_failed", message, {
        commandId: command.id,
        commandType: command.command_type
      });
    }
  }
}

async function executeCommand(commandType: string) {
  switch (commandType) {
    case "diagnostics":
      return collectDiagnostics();
    case "reset_modem":
      await resetModemOrExit("operator_command");
      return { reset: "modem", completedAt: new Date().toISOString() };
    case "restart_service":
      await flushLogs();
      setTimeout(() => process.exit(0), 100);
      return { restart: "scheduled", completedAt: new Date().toISOString() };
    default:
      throw new Error(`Unsupported gateway command ${commandType}`);
  }
}

async function processOne() {
  const message = await api.claimMessage();
  if (!message) return;

  log("info", "message_claimed", `Claimed message ${message.id} to ${redactPhone(message.to_number)}`, {
    messageId: message.id,
    to: redactPhone(message.to_number),
    body: message.body
  });

  const attempt = await api.startAttempt(message.id);
  try {
    const result = await sendSmsWithRecovery(message.to_number, message.body, message.id);
    if (!result.submitted) throw new Error(result.response);
    await reportSubmittedWithRetry(message.id, attempt.id, result.response);
    recordModemSuccess();
    log("info", "message_submitted", `Carrier submitted message ${message.id}`, {
      messageId: message.id,
      to: redactPhone(message.to_number),
      body: message.body,
      modemResponse: result.response
    });
    if (config.resetModemAfterSend) {
      await resetSerialOrExit("post_send_reset");
      log("info", "modem_reset_after_send_success", "Reset modem session after successful SMS submission", {
        messageId: message.id
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const transcript = error && typeof error === "object" && "transcript" in error ? String(error.transcript) : undefined;
    await api.markFailed(message.id, attempt.id, errorMessage, { transcript });
    await recordModemFailure("outbound_send_failed", error);
    if (/Timed out waiting|did not provide SMS prompt|did not confirm carrier submission/i.test(errorMessage)) {
      await resetModemOrExit("send_failure_recovery");
      log("warn", "modem_reset_after_send_failure", "Reset modem serial session after SMS send failure", {
        messageId: message.id,
        errorMessage
      });
    }
    log("error", "message_failed", `Message ${message.id} failed: ${errorMessage}`, {
      messageId: message.id,
      to: redactPhone(message.to_number),
      body: message.body,
      transcript
    });
  }
}

async function reportSubmittedWithRetry(messageId: string, attemptId: string, modemResponse: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await api.markSubmitted(messageId, attemptId, modemResponse);
      return;
    } catch (error) {
      lastError = error;
      log("warn", "submitted_report_retry", `Retrying submitted report ${attempt}/12`, {
        messageId,
        error: error instanceof Error ? error.message : String(error)
      });
      await sleep(Math.min(attempt * 5000, 30000));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Failed to report submitted message"));
}

async function sendSmsWithRecovery(to: string, body: string, messageId: string) {
  try {
    return await modem.sendSms(to, body);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!/Timed out waiting for AT\+CMGS prompt|did not provide SMS prompt/i.test(errorMessage)) {
      throw error;
    }

    log("warn", "sms_prompt_retry_started", "Retrying SMS send after prompt timeout", {
      messageId,
      to: redactPhone(to),
      errorMessage
    });
    await resetModemOrExit("sms_prompt_retry");
    return modem.sendSms(to, body);
  }
}

async function processInbound() {
  if (!modem.listUnreadSms) return;
  if (Date.now() < nextInboundPollAt) return;

  const inboundMessages = await modem.listUnreadSms();
  inboundFailureCount = 0;
  recordModemSuccess();
  nextInboundPollAt = Date.now() + config.inboundPollSeconds * 1000;
  if (!inboundMessages.length) return;

  log("info", "inbound_messages_found", `Found ${inboundMessages.length} inbound SMS message(s)`, {
    count: inboundMessages.length,
    from: inboundMessages.map((message) => redactPhone(message.from))
  });

  const result = await api.ingestInboundMessages(inboundMessages);
  const acceptedIndexes = new Set(result.messages.map((message) => message.modemIndex));

  for (const message of inboundMessages) {
    if (!acceptedIndexes.has(message.modemIndex)) continue;
    recordModemSuccess();
    log("info", "inbound_message_uploaded", `Uploaded inbound SMS from ${redactPhone(message.from)}`, {
      modemIndex: message.modemIndex,
      from: redactPhone(message.from),
      body: message.body
    });
    try {
      await modem.deleteSms?.(message.modemIndex);
      log("info", "inbound_message_deleted", `Deleted inbound SMS modem index ${message.modemIndex}`, {
        modemIndex: message.modemIndex
      });
    } catch (error) {
      await recordModemFailure("inbound_delete_failed", error);
      log("warn", "inbound_delete_failed", error instanceof Error ? error.message : String(error), {
        modemIndex: message.modemIndex
      });
      await resetModemOrExit("inbound_delete_failed");
      try {
        await modem.deleteSms?.(message.modemIndex);
        log("info", "inbound_message_deleted_after_reset", `Deleted inbound SMS modem index ${message.modemIndex} after reset`, {
          modemIndex: message.modemIndex
        });
      } catch (retryError) {
        log("error", "inbound_delete_retry_failed", retryError instanceof Error ? retryError.message : String(retryError), {
          modemIndex: message.modemIndex
        });
      }
    }
  }
}

function recordModemSuccess() {
  modemFailureCount = 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetModemOrExit(reason: string) {
  try {
    await withTimeout((modem.hardReset?.() || modem.reset?.() || Promise.resolve()), 15000, `modem reset ${reason}`);
  } catch (error) {
    log("error", "modem_reset_timeout", error instanceof Error ? error.message : String(error), { reason });
    await flushLogs();
    process.exit(1);
  }
}

async function resetSerialOrExit(reason: string) {
  try {
    await withTimeout((modem.reset?.() || Promise.resolve()), 5000, `modem serial reset ${reason}`);
  } catch (error) {
    log("error", "modem_serial_reset_timeout", error instanceof Error ? error.message : String(error), { reason });
    await flushLogs();
    process.exit(1);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function recordModemFailure(eventType: string, error: unknown) {
  modemFailureCount += 1;
  const message = error instanceof Error ? error.message : String(error);

  if (modemFailureCount >= config.processRestartFailureThreshold) {
    log("error", "modem_restart_threshold_reached", `Restarting gateway after ${modemFailureCount} modem failures`, {
      eventType,
      message
    });
    await flushLogs();
    process.exit(1);
  }

  if (modemFailureCount >= config.modemResetFailureThreshold) {
    log("warn", "modem_reset_started", `Resetting modem after ${modemFailureCount} modem failures`, {
      eventType,
      message
    });
    try {
      await resetModemOrExit("modem_failure_threshold");
    } catch (resetError) {
      log("error", "modem_reset_failed", resetError instanceof Error ? resetError.message : String(resetError));
      await flushLogs();
      process.exit(1);
    }
    modemFailureCount = 0;
    log("info", "modem_reset_complete", "Modem serial session reset; next operation will reinitialize");
  }
}

async function main() {
  log("info", "gateway_started", "RelayHub gateway service started", {
    hubUrl: config.hubUrl,
    modemMode: config.modemMode,
    serialDevice: config.serialDevice,
    serialBaudRate: config.serialBaudRate,
    heartbeatSeconds: config.heartbeatSeconds
  });

  try {
    log("info", "modem_init_started", "Initializing modem");
    await modem.initialize?.();
    recordModemSuccess();
    log("info", "modem_initialized", "Modem initialized successfully", {
      modemMode: config.modemMode,
      serialDevice: config.serialDevice
    });
  } catch (error) {
    await recordModemFailure("modem_init_failed", error);
    log("error", "modem_init_failed", error instanceof Error ? error.message : String(error), {
      transcript: error && typeof error === "object" && "transcript" in error ? String(error.transcript) : undefined
    });
  }

  await heartbeat();
  setInterval(() => void heartbeat(), config.heartbeatSeconds * 1000);
  setInterval(() => void flushLogs(), 10_000);

  while (true) {
    try {
      await processCommands();
    } catch (error) {
      log("warn", "gateway_command_poll_failed", error instanceof Error ? error.message : String(error));
    }

    try {
      await processOne();
    } catch (error) {
      log("error", "outbound_poll_failed", error instanceof Error ? error.message : String(error));
    }

    try {
      await processInbound();
    } catch (error) {
      inboundFailureCount += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const backoffSeconds = Math.min(config.inboundPollSeconds * 2 ** Math.min(inboundFailureCount, 4), 300);
      nextInboundPollAt = Date.now() + backoffSeconds * 1000;
      await recordModemFailure("inbound_poll_failed", error);
      if (/Timed out waiting|did not provide|did not confirm/i.test(errorMessage)) {
        await resetModemOrExit("inbound_poll_timeout");
        log("warn", "modem_reset_after_inbound_failure", "Reset modem session after inbound polling failure", {
          errorMessage
        });
      }
      log("warn", "inbound_poll_failed", errorMessage, {
        nextAttemptSeconds: backoffSeconds
      });
    }
    await sleep(config.pollSeconds * 1000);
  }
}

void main();
