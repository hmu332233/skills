import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillDirectory = path.dirname(testDirectory);
const scriptPath = path.join(skillDirectory, "scripts", "read-session.mjs");
const fixtures = path.join(testDirectory, "fixtures");

function runReader(args, options = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: options.cwd || skillDirectory,
    encoding: "utf8",
    env: options.env || process.env,
  });
  const output = result.stdout.trimEnd();
  let json;
  try {
    json = JSON.parse(output);
  } catch (error) {
    throw new Error(`reader did not return JSON:\n${output}\n${result.stderr}`, { cause: error });
  }
  return { result, json };
}

function expectSuccess(args, options) {
  const { result, json } = runReader(args, options);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(json.error, undefined);
  return json;
}

function expectError(code, args, options) {
  const { result, json } = runReader(args, options);
  assert.equal(result.status, 1);
  assert.equal(json.error.code, code);
  return json.error;
}

test("Codex latest-turn preserves the final response and excludes private records", () => {
  const output = expectSuccess([
    "--provider",
    "codex",
    "--session-id",
    "codex-completed-0001",
    "--root",
    path.join(fixtures, "codex", "completed"),
  ]);

  assert.equal(output.status, "completed");
  assert.equal(output.user_text, "  Review this diff exactly.\nKeep spacing.  ");
  assert.equal(output.final_response, "First line  \n\nSecond **line**");
  assert.deepEqual(output.items, []);
  assert.deepEqual(output.warnings, []);
  assert.doesNotMatch(JSON.stringify(output), /developer secret|private reasoning|TOKEN=/);
});

test("Claude latest-turn preserves text blocks and ignores meta and thinking records", () => {
  const output = expectSuccess([
    "--provider",
    "claude",
    "--session-id",
    "claude-completed-0001",
    "--root",
    path.join(fixtures, "claude", "completed"),
  ]);

  assert.equal(output.status, "completed");
  assert.equal(output.user_text, "  Check this result exactly.  ");
  assert.equal(output.final_response, "Claude first line\n\nClaude second line  ");
  assert.doesNotMatch(JSON.stringify(output), /system secret|private reasoning|fixture metadata/);
});

test("Codex conversation excludes harness instructions and accepts current lifecycle events", () => {
  const output = expectSuccess([
    "--provider",
    "codex",
    "--session-id",
    "codex-completed-0001",
    "--root",
    path.join(fixtures, "codex", "completed"),
    "--mode",
    "conversation",
  ]);

  const userTexts = output.items.filter((item) => item.kind === "user").map((item) => item.text);
  assert.deepEqual(userTexts, ["  Review this diff exactly.\nKeep spacing.  "]);
  assert.doesNotMatch(JSON.stringify(output), /AGENTS\.md|fixture harness instructions|fixture metadata/);
  assert.deepEqual(output.warnings, []);
});

test("reused Codex and Claude sessions select only the newest user turn", () => {
  const cases = [
    {
      provider: "codex",
      id: "codex-reused-0001",
      root: path.join(fixtures, "codex", "reused"),
      user: "new request",
      response: "new response — unchanged",
      excluded: "old response",
    },
    {
      provider: "claude",
      id: "claude-reused-0001",
      root: path.join(fixtures, "claude", "reused"),
      user: "new Claude request",
      response: "new Claude response",
      excluded: "old Claude response",
    },
  ];

  for (const fixture of cases) {
    const output = expectSuccess([
      "--provider",
      fixture.provider,
      "--session-id",
      fixture.id,
      "--root",
      fixture.root,
    ]);
    assert.equal(output.user_text, fixture.user);
    assert.equal(output.final_response, fixture.response);
    assert.doesNotMatch(JSON.stringify(output), new RegExp(fixture.excluded));
  }
});

test("working and blocked fixtures never promote commentary or tool calls to final responses", () => {
  const cases = [
    ["codex", "working", "codex-working-0001"],
    ["codex", "blocked", "codex-blocked-0001"],
    ["claude", "working", "claude-working-0001"],
    ["claude", "blocked", "claude-blocked-0001"],
  ];

  for (const [provider, scenario, id] of cases) {
    const output = expectSuccess([
      "--provider",
      provider,
      "--session-id",
      id,
      "--root",
      path.join(fixtures, provider, scenario),
    ]);
    assert.equal(output.status, "in_progress");
    assert.equal(output.final_response, null);
  }
});

test("conversation mode preserves Claude user, assistant, tool call, and tool result boundaries", () => {
  const output = expectSuccess([
    "--provider",
    "claude",
    "--session-id",
    "claude-working-0001",
    "--root",
    path.join(fixtures, "claude", "working"),
    "--mode",
    "conversation",
    "--max-items",
    "3",
  ]);

  assert.equal(output.status, "in_progress");
  assert.equal(output.truncated, true);
  assert.deepEqual(output.continuation, { omitted_items: 1 });
  assert.deepEqual(
    output.items.map((item) => item.kind),
    ["assistant", "tool_call", "tool_result"],
  );
  assert.equal(output.items[0].text, "I will inspect it now.");
  assert.deepEqual(output.items[1].input, { path: "fixture.txt" });
  assert.equal(output.items[2].output, "tool output");
});

test("an incomplete final line is ignored with a warning for both providers", async (context) => {
  const temporaryDirectory = await mkdtemp(path.join(testDirectory, ".session-reader-partial-"));
  const cases = [
    {
      provider: "codex",
      source: path.join(
        fixtures,
        "codex",
        "malformed",
        "2026",
        "08",
        "09",
        "rollout-codex-malformed-0001.jsonl",
      ),
      destination: path.join(temporaryDirectory, "codex-partial.jsonl"),
    },
    {
      provider: "claude",
      source: path.join(fixtures, "claude", "malformed", "project-a", "claude-malformed-0001.jsonl"),
      destination: path.join(temporaryDirectory, "claude-partial.jsonl"),
    },
  ];

  for (const fixture of cases) {
    const contents = await readFile(fixture.source, "utf8");
    await writeFile(fixture.destination, contents.replace(/\n$/, ""));
    const output = expectSuccess([
      "--provider",
      fixture.provider,
      "--session-path",
      fixture.destination,
    ]);
    assert.equal(output.status, "completed");
    assert.equal(output.final_response, "complete response before partial write");
    assert.deepEqual(output.warnings.map((warning) => warning.code), ["INCOMPLETE_FINAL_LINE"]);
  }

  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(temporaryDirectory, { recursive: true, force: true });
  });
});

test("a malformed line that is not in flight fails explicitly", () => {
  expectError("MALFORMED_JSONL", [
    "--provider",
    "codex",
    "--session-path",
    path.join(
      fixtures,
      "codex",
      "malformed",
      "2026",
      "08",
      "09",
      "rollout-codex-malformed-0001.jsonl",
    ),
  ]);
});

test("schema drift is counted without replacing the final response", () => {
  for (const [provider, id] of [
    ["codex", "codex-drift-0001"],
    ["claude", "claude-drift-0001"],
  ]) {
    const output = expectSuccess([
      "--provider",
      provider,
      "--session-id",
      id,
      "--root",
      path.join(fixtures, provider, "drift"),
    ]);
    assert.equal(output.status, "completed");
    assert.equal(output.warnings.length, 1);
    assert.equal(output.warnings[0].code, "SCHEMA_DRIFT");
    assert.ok(output.warnings[0].count >= 1);
  }
});

test("missing, ambiguous, and metadata-mismatched sessions use stable error codes", async (context) => {
  expectError("SESSION_NOT_FOUND", [
    "--provider",
    "codex",
    "--session-id",
    "codex-missing-0001",
    "--root",
    path.join(fixtures, "codex"),
  ]);
  expectError("AMBIGUOUS_SESSION", [
    "--provider",
    "codex",
    "--session-id",
    "codex-ambiguous-0001",
    "--root",
    path.join(fixtures, "codex", "ambiguous"),
  ]);
  expectError("AMBIGUOUS_SESSION", [
    "--provider",
    "claude",
    "--session-id",
    "claude-ambiguous-0001",
    "--root",
    path.join(fixtures, "claude", "ambiguous"),
  ]);

  const resolvedClaude = expectSuccess([
    "--provider",
    "claude",
    "--session-id",
    "claude-ambiguous-0001",
    "--root",
    path.join(fixtures, "claude", "ambiguous"),
    "--cwd",
    "/workspace/ambiguous-a",
  ]);
  assert.equal(resolvedClaude.final_response, "A");

  const temporaryDirectory = await mkdtemp(path.join(testDirectory, ".session-reader-mismatch-"));
  const mismatchPath = path.join(temporaryDirectory, "codex-requested-0001.jsonl");
  await writeFile(
    mismatchPath,
    `${JSON.stringify({ type: "session_meta", payload: { id: "different-session" } })}\n`,
  );
  expectError("SESSION_METADATA_MISMATCH", [
    "--provider",
    "codex",
    "--session-id",
    "codex-requested-0001",
    "--root",
    temporaryDirectory,
  ]);

  context.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(temporaryDirectory, { recursive: true, force: true });
  });
});

test("provider environment roots and direct paths resolve without configuration writes", async (context) => {
  const temporaryDirectory = await mkdtemp(path.join(testDirectory, ".session-reader-codex-home-"));
  const sessionsDirectory = path.join(temporaryDirectory, "sessions");
  const { mkdir, copyFile, rm } = await import("node:fs/promises");
  await mkdir(sessionsDirectory, { recursive: true });
  const source = path.join(
    fixtures,
    "codex",
    "reused",
    "2026",
    "08",
    "09",
    "rollout-codex-reused-0001.jsonl",
  );
  const destination = path.join(sessionsDirectory, "rollout-codex-reused-0001.jsonl");
  await copyFile(source, destination);

  const fromEnvironment = expectSuccess(
    ["--provider", "codex", "--session-id", "codex-reused-0001"],
    { env: { ...process.env, CODEX_HOME: temporaryDirectory } },
  );
  assert.equal(fromEnvironment.final_response, "new response — unchanged");

  const fromPath = expectSuccess(["--provider", "codex", "--session-path", destination]);
  assert.equal(fromPath.session_id, "codex-reused-0001");
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
});

test("raw mode is bounded and only available when explicitly selected", () => {
  const output = expectSuccess([
    "--provider",
    "codex",
    "--session-id",
    "codex-completed-0001",
    "--root",
    path.join(fixtures, "codex", "completed"),
    "--mode",
    "raw",
    "--max-items",
    "2",
  ]);
  assert.equal(output.raw_records.length, 2);
  assert.equal(output.truncated, true);
  assert.ok(output.continuation.omitted_records > 0);
});

test("CLI executes through a symlinked skill directory", async (context) => {
  const temporaryDirectory = await mkdtemp(path.join(testDirectory, ".session-reader-symlink-"));
  const linkedSkill = path.join(temporaryDirectory, "herdr-read-agent-session");
  const { rm } = await import("node:fs/promises");
  await symlink(skillDirectory, linkedSkill, "dir");

  const result = spawnSync(
    process.execPath,
    [
      path.join(linkedSkill, "scripts", "read-session.mjs"),
      "--provider",
      "codex",
      "--session-id",
      "codex-reused-0001",
      "--root",
      path.join(fixtures, "codex", "reused"),
    ],
    { cwd: skillDirectory, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).final_response, "new response — unchanged");

  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));
});

test("invalid CLI values fail with stable argument errors", () => {
  expectError("UNSUPPORTED_PROVIDER", ["--provider", "other", "--session-id", "session"]);
  expectError("INVALID_SESSION_REFERENCE", ["--provider", "codex", "--session-id", "a", "--session-path", "b"]);
  expectError("INVALID_MODE", ["--provider", "codex", "--session-id", "a", "--mode", "summary"]);
});

test("text format adds provenance without changing the response body", () => {
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--provider",
      "codex",
      "--session-id",
      "codex-completed-0001",
      "--root",
      path.join(fixtures, "codex", "completed"),
      "--format",
      "text",
    ],
    { cwd: skillDirectory, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^Provider: codex\nSession: codex-completed-0001\nStatus: completed\nSource: /);
  assert.ok(result.stdout.endsWith("\n\nFirst line  \n\nSecond **line**\n"));
});

test("skill metadata keeps the required minimal frontmatter and generated interface", async () => {
  const skill = await readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
  const frontmatterMatch = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatterMatch);
  const entries = Object.fromEntries(
    frontmatterMatch[1].split("\n").map((line) => {
      const separator = line.indexOf(":");
      assert.ok(separator > 0, `invalid frontmatter line: ${line}`);
      return [line.slice(0, separator), line.slice(separator + 1).trim()];
    }),
  );
  assert.deepEqual(Object.keys(entries).sort(), ["description", "name"]);
  assert.equal(entries.name, "herdr-read-agent-session");
  assert.match(entries.name, /^[a-z0-9-]+$/);
  assert.ok(entries.description.length > 0 && entries.description.length <= 1024);
  assert.doesNotMatch(entries.description, /[<>]/);

  const interfaceYaml = await readFile(path.join(skillDirectory, "agents", "openai.yaml"), "utf8");
  assert.match(interfaceYaml, /display_name: "Herdr Agent Session Reader"/);
  assert.match(interfaceYaml, /short_description: ".{25,64}"/);
  assert.match(interfaceYaml, /default_prompt: "Use \$herdr-read-agent-session /);
});
