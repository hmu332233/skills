import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  removeBrokenSkillLinks,
  removeRegisteredSkillLinks,
  sourceSkillOrThrow,
} from "./core.js";

function makeFixture(): { targetDir: string; cleanup: () => void } {
  // ponytail: one known source skill is enough to exercise registered status.
  const source = sourceSkillOrThrow("ponytail");
  const base = mkdtempSync(join(tmpdir(), "skills-test-"));
  const targetDir = join(base, "target");
  const sourceDir = join(base, "source");
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });

  symlinkSync(source.path, join(targetDir, source.name), "dir");

  // broken: symlink pointing at a non-existent path
  symlinkSync(join(sourceDir, "gone-1"), join(targetDir, "broken-1"), "dir");
  symlinkSync(join(sourceDir, "gone-2"), join(targetDir, "broken-2"), "dir");

  // external: symlink to a real dir that is not the expected source skill
  const realExt = join(sourceDir, "external-real");
  mkdirSync(realExt);
  symlinkSync(realExt, join(targetDir, "external"), "dir");

  // not-symlink: a real file/dir sitting in the target
  writeFileSync(join(targetDir, "not-symlink"), "plain");

  return {
    targetDir,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

function exists(targetDir: string, name: string): boolean {
  try {
    lstatSync(join(targetDir, name));
    return true;
  } catch {
    return false;
  }
}

test("names omitted removes all broken links, leaves others intact", (t) => {
  const { targetDir, cleanup } = makeFixture();
  t.after(cleanup);

  const removed = removeBrokenSkillLinks(targetDir);
  const names = removed.map((r) => r.name).sort();
  assert.deepEqual(names, ["broken-1", "broken-2"]);

  assert.ok(!exists(targetDir, "broken-1"));
  assert.ok(!exists(targetDir, "broken-2"));
  assert.ok(exists(targetDir, "ponytail"));
  assert.ok(exists(targetDir, "external"));
  assert.ok(exists(targetDir, "not-symlink"));
});

test("names subset removes only those broken links", (t) => {
  const { targetDir, cleanup } = makeFixture();
  t.after(cleanup);

  const removed = removeBrokenSkillLinks(targetDir, ["broken-1"]);
  assert.deepEqual(removed.map((r) => r.name), ["broken-1"]);

  assert.ok(!exists(targetDir, "broken-1"));
  assert.ok(exists(targetDir, "broken-2"));
});

test("non-broken name in names is never removed", (t) => {
  const { targetDir, cleanup } = makeFixture();
  t.after(cleanup);

  const removed = removeBrokenSkillLinks(targetDir, [
    "ponytail",
    "external",
    "not-symlink",
    "broken-1",
  ]);
  assert.deepEqual(removed.map((r) => r.name), ["broken-1"]);

  assert.ok(exists(targetDir, "ponytail"));
  assert.ok(exists(targetDir, "external"));
  assert.ok(exists(targetDir, "not-symlink"));
  assert.ok(!exists(targetDir, "broken-1"));
});

test("empty names removes nothing", (t) => {
  const { targetDir, cleanup } = makeFixture();
  t.after(cleanup);

  const removed = removeBrokenSkillLinks(targetDir, []);
  assert.deepEqual(removed, []);
  assert.ok(exists(targetDir, "broken-1"));
  assert.ok(exists(targetDir, "broken-2"));
});

test("removes registered links and skips every protected status", (t) => {
  const { targetDir, cleanup } = makeFixture();
  t.after(cleanup);

  const result = removeRegisteredSkillLinks(targetDir, [
    "ponytail",
    "broken-1",
    "external",
    "not-symlink",
  ]);

  assert.deepEqual(result.removed.map((entry) => entry.name), ["ponytail"]);
  assert.deepEqual(
    result.skipped.map((entry) => [entry.name, entry.status]),
    [
      ["broken-1", "broken"],
      ["external", "external"],
      ["not-symlink", "not-symlink"],
    ]
  );
  assert.ok(!exists(targetDir, "ponytail"));
  assert.ok(exists(targetDir, "broken-1"));
  assert.ok(exists(targetDir, "external"));
  assert.ok(exists(targetDir, "not-symlink"));
});
