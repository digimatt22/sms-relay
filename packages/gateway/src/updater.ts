import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GatewayConfig } from "./config.js";

const execFileAsync = promisify(execFile);
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;

export type PreparedGatewayUpdate = {
  kind: "prepared_gateway_update";
  tempRoot: string;
  releaseDir: string;
  installDir: string;
  serviceName: string;
  version: string;
};

export async function prepareGatewayUpdate(config: GatewayConfig): Promise<PreparedGatewayUpdate> {
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    throw new Error("Gateway updates require the relayhub-gateway service to run as root");
  }
  if (!config.packageUrl.startsWith("https://")) {
    throw new Error("Gateway update package URL must use HTTPS");
  }
  if (!path.isAbsolute(config.installDir) || config.installDir === "/") {
    throw new Error("Gateway install directory must be an absolute non-root path");
  }
  if (!/^[a-zA-Z0-9_.@-]+$/.test(config.serviceName)) {
    throw new Error("Gateway service name is invalid");
  }

  const installParent = path.dirname(config.installDir);
  await mkdir(installParent, { recursive: true });
  const tempRoot = await mkdtemp(path.join(installParent, ".relayhub-update-"));
  const archivePath = path.join(tempRoot, "gateway.tar.gz");
  const releaseDir = path.join(tempRoot, "release");

  try {
    const response = await fetch(config.packageUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
      throw new Error(`Gateway package download failed with HTTP ${response.status}`);
    }
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_PACKAGE_BYTES) {
      throw new Error("Gateway package exceeds the 50 MB safety limit");
    }
    const packageBytes = Buffer.from(await response.arrayBuffer());
    if (!packageBytes.length || packageBytes.length > MAX_PACKAGE_BYTES) {
      throw new Error("Gateway package is empty or exceeds the 50 MB safety limit");
    }
    await writeFile(archivePath, packageBytes, { mode: 0o600 });

    const { stdout: archiveListing } = await execFileAsync("tar", ["-tzf", archivePath], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 30_000
    });
    const unsafeEntry = archiveListing
      .split(/\r?\n/)
      .filter(Boolean)
      .find((entry) => path.posix.isAbsolute(entry) || entry.split("/").includes(".."));
    if (unsafeEntry) throw new Error(`Gateway package contains an unsafe path: ${unsafeEntry}`);

    await mkdir(releaseDir, { mode: 0o755 });
    await execFileAsync("tar", ["-xzf", archivePath, "--no-same-owner", "--no-same-permissions", "-C", releaseDir], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 30_000
    });
    await access(path.join(releaseDir, "dist", "index.js"));
    const packageJsonPath = path.join(releaseDir, "package.json");
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
    if (packageJson.name !== "@relayhub/gateway-runtime" || typeof packageJson.version !== "string") {
      throw new Error("Downloaded package is not a RelayHub gateway release");
    }

    await execFileAsync("/usr/bin/npm", ["--prefix", releaseDir, "install", "--omit=dev"], {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 180_000
    });

    return {
      kind: "prepared_gateway_update",
      tempRoot,
      releaseDir,
      installDir: config.installDir,
      serviceName: config.serviceName,
      version: packageJson.version
    };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export function isPreparedGatewayUpdate(value: unknown): value is PreparedGatewayUpdate {
  return Boolean(value && typeof value === "object" && "kind" in value && value.kind === "prepared_gateway_update");
}

export async function scheduleGatewayUpdate(update: PreparedGatewayUpdate) {
  const helperPath = path.join(update.tempRoot, `apply-${randomUUID()}.mjs`);
  const previousDir = `${update.installDir}.previous`;
  const helperSource = `
import { rename, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const update = ${JSON.stringify({
    tempRoot: update.tempRoot,
    releaseDir: update.releaseDir,
    installDir: update.installDir,
    previousDir,
    serviceName: update.serviceName
  })};

await new Promise((resolve) => setTimeout(resolve, 1000));
await rm(update.previousDir, { recursive: true, force: true });
await rename(update.installDir, update.previousDir);
try {
  await rename(update.releaseDir, update.installDir);
} catch (error) {
  await rename(update.previousDir, update.installDir);
  throw error;
}

const restarted = spawnSync("systemctl", ["restart", update.serviceName], { stdio: "ignore" });
if (restarted.status !== 0) {
  await rm(update.installDir, { recursive: true, force: true });
  await rename(update.previousDir, update.installDir);
  spawnSync("systemctl", ["restart", update.serviceName], { stdio: "ignore" });
  throw new Error("Updated gateway could not be restarted; restored previous release");
}
await rm(update.tempRoot, { recursive: true, force: true });
`;

  await writeFile(helperPath, helperSource, { mode: 0o700 });
  const child = spawn("/usr/bin/node", [helperPath], {
    cwd: "/",
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}
