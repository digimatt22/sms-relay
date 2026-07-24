import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const PROHIBITED_RELEASE_PATHS = [
  /(^|\/)backups?(\/|$)/i,
  /(^|\/)\.env($|\.)/i,
  /\.(dump|db|sqlite|sqlite3|pem|key|p12|pfx|tar|tar\.gz|tgz|zip|7z)$/i,
  /(^|\/)[^/]*(credential|secret)[^/]*\.json$/i,
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout;
}

export function prohibitedReleasePaths(paths) {
  return paths.filter((candidate) => {
    if (candidate === ".env.example") return false;
    return PROHIBITED_RELEASE_PATHS.some((pattern) => pattern.test(candidate));
  });
}

export function assertReleasePathsSafe(paths, sourceLabel) {
  const prohibited = prohibitedReleasePaths(paths);
  if (prohibited.length) {
    throw new Error(
      `${sourceLabel} contains prohibited release paths:\n${prohibited.join("\n")}`,
    );
  }
}

export function assertCleanExactCommit(requestedCommit = "HEAD") {
  const head = run("git", ["rev-parse", "HEAD"]).trim();
  const commit = run("git", ["rev-parse", `${requestedCommit}^{commit}`]).trim();
  if (commit !== head) {
    throw new Error(`release commit ${commit} is not checked-out HEAD ${head}`);
  }
  const status = run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (status.trim()) {
    throw new Error("release packaging requires a clean worktree, including no untracked files");
  }
  return commit;
}

export async function auditArchive(archivePath) {
  const entries = run("tar", ["-tzf", archivePath])
    .split("\n")
    .filter(Boolean)
    .map((entry) => entry.replace(/^[^/]+\//, ""));
  assertReleasePathsSafe(entries, archivePath);
  const bytes = await readFile(archivePath);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    entryCount: entries.length,
  };
}

export async function packageRelease({
  requestedCommit = "HEAD",
  outputDirectory,
} = {}) {
  if (!outputDirectory) {
    throw new Error("outputDirectory is required and should be outside the worktree");
  }
  const commit = assertCleanExactCommit(requestedCommit);
  const trackedPaths = run("git", ["ls-tree", "-r", "--name-only", commit])
    .split("\n")
    .filter(Boolean);
  assertReleasePathsSafe(trackedPaths, `Git commit ${commit}`);

  await mkdir(outputDirectory, { recursive: true });
  const shortCommit = commit.slice(0, 12);
  const archiveName = `relayhub-sms-${shortCommit}.tar.gz`;
  const archivePath = path.resolve(outputDirectory, archiveName);
  run("git", [
    "archive",
    "--format=tar.gz",
    `--prefix=relayhub-sms-${shortCommit}/`,
    `--output=${archivePath}`,
    commit,
  ]);

  const audit = await auditArchive(archivePath);
  const provenance = {
    contract: "sheldon-deploy/0.2.0",
    source: {
      vcs: "git",
      commit,
      cleanWorktreeRequired: true,
    },
    archive: {
      filename: archiveName,
      sha256: audit.sha256,
      entryCount: audit.entryCount,
    },
    generatedArtifacts: [
      `${archiveName}.provenance.json`,
      `${archiveName}.sha256`,
    ],
  };
  const provenancePath = `${archivePath}.provenance.json`;
  const checksumPath = `${archivePath}.sha256`;
  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, {
    mode: 0o600,
  });
  await writeFile(checksumPath, `${audit.sha256}  ${archiveName}\n`, {
    mode: 0o600,
  });
  return { archivePath, provenancePath, checksumPath, ...audit, commit };
}

async function main() {
  const [command, value] = process.argv.slice(2);
  if (command === "audit") {
    if (!value) throw new Error("usage: node scripts/release-policy.mjs audit ARCHIVE");
    console.log(JSON.stringify(await auditArchive(path.resolve(value)), null, 2));
    return;
  }
  if (command === "package") {
    if (!value) {
      throw new Error(
        "usage: node scripts/release-policy.mjs package OUTPUT_DIRECTORY [COMMIT]",
      );
    }
    const result = await packageRelease({
      outputDirectory: path.resolve(value),
      requestedCommit: process.argv[4] || "HEAD",
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error(
    "usage: node scripts/release-policy.mjs <audit ARCHIVE|package OUTPUT_DIRECTORY [COMMIT]>",
  );
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
