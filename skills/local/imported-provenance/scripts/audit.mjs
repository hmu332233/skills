#!/usr/bin/env node
// Audit imported skill provenance against skills-lock.json (the source of truth).
//
// For every skill directory under skills/imported/, report whether its
// provenance.json is present, well-formed, and consistent with the lock entry.
// Hashes are NOT recomputed locally: importedHash/computedHash are recorded at
// import time against the upstream source content and cannot be reproduced here.
// The lock file is therefore the canonical reference for hash and source fields.
//
// Usage:
//   node audit.mjs [--repo <path>] [--json]
//   node audit.mjs --backfill          # write provenance.json for OK-to-fix entries
//   node audit.mjs --sync              # rewrite provenance.json from lock for all entries
//
// Exit code: 0 if clean, 1 if any problem found (non-backfill/sync runs).

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const AS_JSON = flag("--json");
const BACKFILL = flag("--backfill");
const SYNC = flag("--sync");

// Repo root: explicit --repo, else walk up from cwd until skills-lock.json is found.
function findRepoRoot() {
  const explicit = opt("--repo");
  if (explicit) return explicit;
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, "skills-lock.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to two levels up from this script (skills/local/imported-provenance/scripts).
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..");
}

const REPO = findRepoRoot();
const LOCK_PATH = join(REPO, "skills-lock.json");
const IMPORTED_DIR = join(REPO, "skills", "imported");

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(2);
}

if (!existsSync(LOCK_PATH)) fail(`skills-lock.json not found at ${LOCK_PATH}`);
if (!existsSync(IMPORTED_DIR)) fail(`skills/imported not found at ${IMPORTED_DIR}`);

let lock;
try {
  lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
} catch (e) {
  fail(`skills-lock.json is not valid JSON: ${e.message}`);
}
const lockSkills = lock.skills ?? {};

// Derive the expected provenance record for a skill from its lock entry.
// sourcePath = directory of skillPath (drop trailing /SKILL.md).
function expectedProvenance(name) {
  const entry = lockSkills[name];
  if (!entry) return null;
  const sourcePath = entry.skillPath
    ? entry.skillPath.replace(/\/SKILL\.md$/, "")
    : null;
  return {
    source: entry.source ?? null,
    sourceType: entry.sourceType ?? null,
    sourcePath,
    importedRevision: entry.importedRevision ?? null,
    importedHash: entry.computedHash ?? entry.importedHash ?? null,
  };
}

function serialize(p) {
  return JSON.stringify(p, null, 2) + "\n";
}

const dirs = readdirSync(IMPORTED_DIR).filter((d) =>
  statSync(join(IMPORTED_DIR, d)).isDirectory()
);

const results = [];
let wrote = 0;

for (const name of dirs.sort()) {
  const provPath = join(IMPORTED_DIR, name, "provenance.json");
  const expected = expectedProvenance(name);
  const r = { skill: name, status: "ok", detail: "", problems: [] };

  if (!expected) {
    r.status = "no-lock-entry";
    r.detail = "directory has no entry in skills-lock.json";
    r.problems.push("missing lock entry");
    results.push(r);
    continue;
  }

  let actual = null;
  if (existsSync(provPath)) {
    try {
      actual = JSON.parse(readFileSync(provPath, "utf8"));
    } catch (e) {
      r.status = "invalid-json";
      r.detail = e.message;
      r.problems.push("malformed provenance.json");
    }
  } else {
    r.status = "missing";
    r.detail = "provenance.json absent";
    r.problems.push("missing file");
  }

  if (actual) {
    for (const key of ["source", "sourceType", "sourcePath", "importedHash"]) {
      if (actual[key] !== expected[key]) {
        r.problems.push(`${key} mismatch (have ${JSON.stringify(actual[key])}, want ${JSON.stringify(expected[key])})`);
      }
    }
    if (r.problems.length) {
      r.status = "mismatch";
      r.detail = r.problems.join("; ");
    }
  }

  // Apply fixes.
  const shouldWrite =
    (SYNC) ||
    (BACKFILL && (r.status === "missing" || r.status === "invalid-json"));
  if (shouldWrite) {
    writeFileSync(provPath, serialize(expected));
    wrote++;
    r.status = r.status === "ok" ? "ok" : "fixed";
    r.detail = r.status === "fixed" ? "written from lock" : r.detail;
    r.problems = [];
  }

  results.push(r);
}

const problems = results.filter((r) => r.problems.length > 0);

if (AS_JSON) {
  console.log(JSON.stringify({ repo: REPO, wrote, results }, null, 2));
} else {
  for (const r of results) {
    const mark =
      r.status === "ok" ? "✓" :
      r.status === "fixed" ? "✎" : "✗";
    const tail = r.detail ? `  — ${r.detail}` : "";
    console.log(`${mark} ${r.skill.padEnd(28)} ${r.status}${tail}`);
  }
  if (wrote) console.log(`\n${wrote} provenance.json file(s) written.`);
  if (!wrote && problems.length === 0) console.log("\nAll provenance records consistent with skills-lock.json.");
  if (!wrote && problems.length) console.log(`\n${problems.length} problem(s) found. Re-run with --backfill or --sync to fix.`);
}

// Non-fixing audit runs exit non-zero on any problem so they compose in checks.
if (!BACKFILL && !SYNC && problems.length) process.exit(1);
