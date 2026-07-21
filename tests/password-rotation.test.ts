import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("seeded admin must change the temporary password", () => {
  const seed = readFileSync("scripts/seed-admin.mjs", "utf8");
  const migration = readFileSync("migrations/010_password_rotation.sql", "utf8");

  assert.match(seed, /mwood@digicolony\.com/);
  assert.match(seed, /must_change_password/);
  assert.match(migration, /must_change_password boolean NOT NULL DEFAULT false/);
});

test("password rotation is enforced across authenticated surfaces", () => {
  const pageAuth = readFileSync("src/lib/page-auth.ts", "utf8");
  const guards = readFileSync("src/lib/guards.ts", "utf8");
  const actions = readFileSync("src/app/actions.ts", "utf8");
  const changePage = readFileSync("src/app/change-password/page.tsx", "utf8");
  const changeForm = readFileSync("src/app/change-password/change-password-form.tsx", "utf8");

  assert.match(pageAuth, /mustChangePassword/);
  assert.match(guards, /Password change required/);
  assert.match(actions, /changeRequiredPasswordAction/);
  assert.match(actions, /must_change_password = false/);
  assert.match(changePage, /getPlatformName/);
  assert.match(changeForm, /temporary password must be changed/);
});
