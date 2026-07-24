import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isWriteFenceEnabled,
  shouldBlockWrite,
} from "../src/lib/write-fence";

test("write fence is explicit and defaults inactive", () => {
  assert.equal(isWriteFenceEnabled(undefined), false);
  assert.equal(isWriteFenceEnabled("false"), false);
  assert.equal(isWriteFenceEnabled("TRUE"), false);
  assert.equal(isWriteFenceEnabled("true"), true);
});

test("active write fence permits reads and blocks mutations", () => {
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    assert.equal(shouldBlockWrite(method, true), false);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.equal(shouldBlockWrite(method, true), true);
    assert.equal(shouldBlockWrite(method, false), false);
  }
});

test("proxy applies the fence before API auth and includes API routes", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  const manifest = readFileSync("sheldon.json", "utf8");

  assert.match(proxy, /shouldBlockWrite\(request\.method, fenceEnabled\)/);
  assert.match(proxy, /Service temporarily read-only/);
  assert.match(proxy, /status: 503/);
  assert.match(proxy, /"retry-after": "60"/);
  assert.match(proxy, /"x-relayhub-write-fence": "active"/);
  assert.doesNotMatch(proxy, /\(\?!api\|/);
  assert.match(manifest, /RELAYHUB_WRITE_FENCE/);
});
