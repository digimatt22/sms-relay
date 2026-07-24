import { readFile, writeFile } from "node:fs/promises";

const [sourcePath, targetPath, reportPath] = process.argv.slice(2);
if (!sourcePath || !targetPath) {
  throw new Error(
    "usage: node scripts/database-compare.mjs SOURCE_SNAPSHOT TARGET_SNAPSHOT [REPORT]",
  );
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const target = JSON.parse(await readFile(targetPath, "utf8"));
const failures = [];
const volatileTables = new Set(["gateway_health", "gateway_logs"]);

function protectedCounts(snapshot) {
  if (snapshot.protected_table_counts) return snapshot.protected_table_counts;
  return Object.fromEntries(
    Object.entries(snapshot.table_counts).filter(
      ([table]) => !volatileTables.has(table),
    ),
  );
}

function compare(label, left, right) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    failures.push({ label, source: left, target: right });
  }
}

compare(
  "PostgreSQL major version",
  Math.floor(source.metadata.version_num / 10000),
  Math.floor(target.metadata.version_num / 10000),
);
compare("database name", source.metadata.database, target.metadata.database);
compare("encoding", source.metadata.encoding, target.metadata.encoding);
compare("collation", source.metadata.collation, target.metadata.collation);
compare("ctype", source.metadata.ctype, target.metadata.ctype);
compare("migration ledger", source.ledger, target.ledger);
compare("schema fingerprint", source.schema.sha256, target.schema.sha256);
compare("schema table count", source.schema.table_count, target.schema.table_count);
compare(
  "extension versions",
  source.schema.extension_versions,
  target.schema.extension_versions,
);
compare(
  "protected table counts",
  protectedCounts(source),
  protectedCounts(target),
);
compare("relationship checks", source.relationships, target.relationships);

for (const [name, count] of Object.entries(target.relationships)) {
  if (Number(count) !== 0) failures.push({ label: name, expected: 0, target: count });
}

const owner = target.roles.find(({ rolname }) => rolname === "relayhub_sms_owner");
const runtime = target.roles.find(
  ({ rolname }) => rolname === "relayhub_sms_runtime",
);
if (!owner) failures.push({ label: "owner role", expected: "present" });
if (!runtime) failures.push({ label: "runtime role", expected: "present" });
if (runtime) {
  for (const field of [
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolinherit",
    "rolreplication",
  ]) {
    if (runtime[field] !== false) {
      failures.push({ label: `runtime ${field}`, expected: false, target: runtime[field] });
    }
  }
  if (runtime.rolconnlimit !== 20) {
    failures.push({
      label: "runtime connection limit",
      expected: 20,
      target: runtime.rolconnlimit,
    });
  }
  if (runtime.owned_objects !== 0) {
    failures.push({
      label: "runtime owned objects",
      expected: 0,
      target: runtime.owned_objects,
    });
  }
}
if (owner) {
  for (const field of [
    "rolsuper",
    "rolcreatedb",
    "rolcreaterole",
    "rolreplication",
  ]) {
    if (owner[field] !== false) {
      failures.push({ label: `owner ${field}`, expected: false, target: owner[field] });
    }
  }
  if (owner.rolconnlimit !== 5) {
    failures.push({
      label: "owner connection limit",
      expected: 5,
      target: owner.rolconnlimit,
    });
  }
}
if (target.metadata.database_owner !== "relayhub_sms_owner") {
  failures.push({
    label: "database owner",
    expected: "relayhub_sms_owner",
    target: target.metadata.database_owner,
  });
}
if (!target.schema_owners.some(
  ({ nspname, owner: role }) =>
    nspname === "public" &&
    (role === "relayhub_sms_owner" || role === "pg_database_owner"),
)) {
  failures.push({
    label: "public schema owner",
    expected: "relayhub_sms_owner",
    target: target.schema_owners,
  });
}

const report = {
  compared_at: new Date().toISOString(),
  source_snapshot: sourcePath,
  target_snapshot: targetPath,
  status: failures.length ? "failed" : "passed",
  checks: 11 + Object.keys(target.relationships).length + 9,
  failures,
};
const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) await writeFile(reportPath, rendered, { mode: 0o600 });
process.stdout.write(rendered);
if (failures.length) process.exitCode = 1;
