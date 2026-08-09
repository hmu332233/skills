#!/usr/bin/env node

import { readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDERS = new Set(["codex", "claude"]);
const MODES = new Set(["latest-turn", "conversation", "raw"]);
const FORMATS = new Set(["json", "text"]);
const DEFAULT_MAX_ITEMS = 50;
const MAX_CONVERSATION_CHARS = 100_000;

const CODEX_TOP_LEVEL_RECORDS = new Set([
  "session_meta",
  "response_item",
  "event_msg",
  "turn_context",
  "compacted",
  "world_state",
  "ghost_snapshot",
]);

const CODEX_IGNORED_RESPONSE_ITEMS = new Set([
  "reasoning",
  "function_call",
  "function_call_output",
  "web_search_call",
  "computer_call",
  "computer_call_output",
]);

const CODEX_KNOWN_EVENTS = new Set([
  "session_configured",
  "item_completed",
  "task_started",
  "task_complete",
  "task_aborted",
  "turn_aborted",
  "user_message",
  "agent_message",
  "agent_reasoning",
  "agent_reasoning_raw_content",
  "token_count",
  "exec_command_begin",
  "exec_command_output_delta",
  "exec_command_end",
  "turn_diff",
  "stream_error",
  "plan_update",
  "thread_settings_applied",
]);

const CLAUDE_IGNORED_RECORDS = new Set([
  "system",
  "progress",
  "summary",
  "queue-operation",
  "file-history-snapshot",
  "permission-mode",
  "mode",
  "ai-title",
  "custom-title",
  "last-prompt",
]);

class SessionReaderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionReaderError";
    this.code = code;
  }
}

function addWarning(warnings, code, message, count = 1) {
  const existing = warnings.find((warning) => warning.code === code);
  if (existing) {
    existing.count += count;
    return;
  }
  warnings.push({ code, message, count });
}

function cloneWarnings(warnings) {
  return warnings.map((warning) => ({ ...warning }));
}

function parsePositiveInteger(value, flag) {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new SessionReaderError("INVALID_ARGUMENT", `${flag} must be a positive integer`);
  }
  return Number(value);
}

export function parseArgs(argv) {
  const options = {
    mode: "latest-turn",
    format: "json",
    maxItems: DEFAULT_MAX_ITEMS,
    roots: [],
    cwd: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      options.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new SessionReaderError("INVALID_ARGUMENT", `${flag} requires a value`);
    }
    index += 1;
    switch (flag) {
      case "--provider":
        options.provider = value;
        break;
      case "--session-id":
        options.sessionId = value;
        break;
      case "--session-path":
        options.sessionPath = value;
        break;
      case "--mode":
        options.mode = value;
        break;
      case "--format":
        options.format = value;
        break;
      case "--max-items":
        options.maxItems = parsePositiveInteger(value, flag);
        break;
      case "--root":
        options.roots.push(value);
        break;
      case "--cwd":
        options.cwd = path.resolve(value);
        break;
      default:
        throw new SessionReaderError("INVALID_ARGUMENT", `unknown option: ${flag}`);
    }
  }

  if (options.help) return options;
  if (!PROVIDERS.has(options.provider)) {
    throw new SessionReaderError("UNSUPPORTED_PROVIDER", "--provider must be codex or claude");
  }
  if (Boolean(options.sessionId) === Boolean(options.sessionPath)) {
    throw new SessionReaderError(
      "INVALID_SESSION_REFERENCE",
      "provide exactly one of --session-id or --session-path",
    );
  }
  if (options.sessionId && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(options.sessionId)) {
    throw new SessionReaderError("INVALID_SESSION_ID", "session ID contains unsupported characters");
  }
  if (!MODES.has(options.mode)) {
    throw new SessionReaderError("INVALID_MODE", "--mode must be latest-turn, conversation, or raw");
  }
  if (!FORMATS.has(options.format)) {
    throw new SessionReaderError("INVALID_FORMAT", "--format must be json or text");
  }
  if (options.roots.length > 0 && options.sessionPath) {
    throw new SessionReaderError("INVALID_ARGUMENT", "--root cannot be used with --session-path");
  }
  return options;
}

function defaultRoots(provider, environment = process.env) {
  if (provider === "codex") {
    const codexHome = environment.CODEX_HOME || path.join(homedir(), ".codex");
    return [path.join(codexHome, "sessions")];
  }
  const claudeHome = environment.CLAUDE_CONFIG_DIR || path.join(homedir(), ".claude");
  return [path.join(claudeHome, "projects")];
}

async function loadJsonl(sourcePath) {
  let contents;
  try {
    contents = await readFile(sourcePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new SessionReaderError("SESSION_PATH_NOT_FOUND", `session path does not exist: ${sourcePath}`);
    }
    throw new SessionReaderError("SESSION_READ_FAILED", `cannot read session path: ${sourcePath}`);
  }

  const warnings = [];
  const records = [];
  const rawRecords = [];
  const lines = contents.split("\n");
  let lastContentLine = lines.length - 1;
  while (lastContentLine >= 0 && lines[lastContentLine].trim() === "") lastContentLine -= 1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex].endsWith("\r") ? lines[lineIndex].slice(0, -1) : lines[lineIndex];
    if (rawLine.trim() === "") continue;
    try {
      records.push(JSON.parse(rawLine));
      rawRecords.push(rawLine);
    } catch {
      if (lineIndex === lastContentLine && !contents.endsWith("\n")) {
        addWarning(
          warnings,
          "INCOMPLETE_FINAL_LINE",
          "ignored an incomplete final JSONL line that may still be in flight",
        );
        break;
      }
      throw new SessionReaderError(
        "MALFORMED_JSONL",
        `invalid JSON at line ${lineIndex + 1} in ${sourcePath}`,
      );
    }
  }
  return { records, rawRecords, warnings };
}

function sessionIdentity(provider, records, expectedSessionId) {
  if (provider === "codex") {
    const ids = new Set(
      records
        .filter((record) => record?.type === "session_meta")
        .map((record) => record?.payload?.id)
        .filter((value) => typeof value === "string" && value.length > 0),
    );
    if (ids.size !== 1) {
      throw new SessionReaderError(
        "SESSION_METADATA_INVALID",
        "Codex transcript must contain exactly one session_meta ID",
      );
    }
    const [sessionId] = ids;
    if (expectedSessionId && sessionId !== expectedSessionId) {
      throw new SessionReaderError("SESSION_METADATA_MISMATCH", "Codex session_meta ID does not match");
    }
    const cwd = records.find((record) => record?.type === "session_meta")?.payload?.cwd;
    return { sessionId, cwd };
  }

  const ids = new Set(
    records
      .map((record) => record?.sessionId)
      .filter((value) => typeof value === "string" && value.length > 0),
  );
  if (ids.size !== 1) {
    throw new SessionReaderError(
      "SESSION_METADATA_INVALID",
      "Claude transcript must contain exactly one sessionId",
    );
  }
  const [sessionId] = ids;
  if (expectedSessionId && sessionId !== expectedSessionId) {
    throw new SessionReaderError("SESSION_METADATA_MISMATCH", "Claude sessionId does not match");
  }
  const cwd = records.find((record) => typeof record?.cwd === "string")?.cwd;
  return { sessionId, cwd };
}

async function findFiles(root, matches) {
  const found = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES") return;
      throw new SessionReaderError("SESSION_ROOT_READ_FAILED", `cannot search session root: ${root}`);
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && matches(entry.name)) {
        found.push(entryPath);
      }
    }
  }
  await visit(root);
  return found;
}

async function resolveSession(options) {
  if (options.sessionPath) {
    const sourcePath = path.resolve(options.sessionPath);
    const loaded = await loadJsonl(sourcePath);
    const identity = sessionIdentity(options.provider, loaded.records);
    return { sourcePath, ...loaded, ...identity };
  }

  const roots = (options.roots.length > 0 ? options.roots : defaultRoots(options.provider)).map((root) =>
    path.resolve(root),
  );
  const matches =
    options.provider === "codex"
      ? (name) => name.endsWith(".jsonl") && name.includes(options.sessionId)
      : (name) => name === `${options.sessionId}.jsonl`;
  const nestedCandidates = await Promise.all(roots.map((root) => findFiles(root, matches)));
  const candidatePaths = [...new Set(nestedCandidates.flat())].sort();
  if (candidatePaths.length === 0) {
    throw new SessionReaderError("SESSION_NOT_FOUND", `no ${options.provider} transcript matched the session ID`);
  }

  const valid = [];
  const rejected = [];
  for (const sourcePath of candidatePaths) {
    try {
      const loaded = await loadJsonl(sourcePath);
      const identity = sessionIdentity(options.provider, loaded.records, options.sessionId);
      valid.push({ sourcePath, ...loaded, ...identity });
    } catch (error) {
      rejected.push(error);
    }
  }
  if (valid.length === 0) {
    if (candidatePaths.length === 1 && rejected[0] instanceof SessionReaderError) throw rejected[0];
    throw new SessionReaderError(
      "SESSION_METADATA_MISMATCH",
      "matching filenames were found, but none had the requested session metadata",
    );
  }
  if (valid.length === 1) return valid[0];

  const requestedCwd = path.resolve(options.cwd);
  const cwdMatches = valid.filter(
    (candidate) => typeof candidate.cwd === "string" && path.resolve(candidate.cwd) === requestedCwd,
  );
  if (cwdMatches.length === 1) return cwdMatches[0];
  throw new SessionReaderError(
    "AMBIGUOUS_SESSION",
    `multiple verified ${options.provider} transcripts matched the session ID`,
  );
}

function isSyntheticEnvelope(text) {
  const value = text.trim();
  const xmlEnvelope =
    /^(?:<system-reminder\b[\s\S]*<\/system-reminder>|<environment_context\b[\s\S]*<\/environment_context>|<turn_aborted\b[\s\S]*<\/turn_aborted>)$/;
  const agentInstructions =
    /^# AGENTS\.md instructions for [^\n]+\n+<INSTRUCTIONS>[\s\S]*<\/INSTRUCTIONS>$/;
  return xmlEnvelope.test(value) || agentInstructions.test(value);
}

function pushTextBlocks({ items, blocks, role, recordIndex, messageId, finalHint, warnings, provider }) {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const expectedTypes = role === "user" ? new Set(["input_text", "text"]) : new Set(["output_text", "text"]);
    if (block && expectedTypes.has(block.type) && typeof block.text === "string") {
      if (role === "user" && isSyntheticEnvelope(block.text)) continue;
      items.push({
        kind: role,
        text: block.text,
        recordIndex,
        blockIndex,
        messageId,
        finalHint: role === "assistant" && finalHint,
      });
    } else {
      addWarning(
        warnings,
        "SCHEMA_DRIFT",
        `ignored an unknown ${provider} ${role} content block`,
      );
    }
  }
}

function parseCodex(records, initialWarnings) {
  const warnings = cloneWarnings(initialWarnings);
  const items = [];
  const completedAt = [];
  const abortedAt = [];

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (!record || typeof record.type !== "string") {
      addWarning(warnings, "SCHEMA_DRIFT", "ignored a Codex record without a recognized type");
      continue;
    }
    if (!CODEX_TOP_LEVEL_RECORDS.has(record.type)) {
      addWarning(warnings, "SCHEMA_DRIFT", "ignored an unknown Codex record type");
      continue;
    }
    if (record.type === "event_msg") {
      const eventType = record?.payload?.type;
      if (eventType === "task_complete") completedAt.push(recordIndex);
      if (eventType === "task_aborted" || eventType === "turn_aborted") abortedAt.push(recordIndex);
      if (typeof eventType !== "string" || !CODEX_KNOWN_EVENTS.has(eventType)) {
        addWarning(warnings, "SCHEMA_DRIFT", "ignored an unknown Codex event type");
      }
      continue;
    }
    if (record.type !== "response_item") continue;

    const payload = record.payload;
    const payloadType = payload?.type;
    if (payloadType === "message") {
      const role = payload.role;
      if (role === "system" || role === "developer") continue;
      if (role !== "user" && role !== "assistant") {
        addWarning(warnings, "SCHEMA_DRIFT", "ignored a Codex message with an unknown role");
        continue;
      }
      if (!Array.isArray(payload.content)) {
        addWarning(warnings, "SCHEMA_DRIFT", "ignored a Codex message without content blocks");
        continue;
      }
      pushTextBlocks({
        items,
        blocks: payload.content,
        role,
        recordIndex,
        messageId: `codex-${recordIndex}`,
        finalHint: payload.phase === "final_answer" || payload.phase === "final",
        warnings,
        provider: "Codex",
      });
      continue;
    }
    if (payloadType === "custom_tool_call") {
      items.push({
        kind: "tool_call",
        name: payload.name ?? null,
        call_id: payload.call_id ?? payload.id ?? null,
        input: payload.input ?? null,
        recordIndex,
        blockIndex: 0,
        messageId: `codex-${recordIndex}`,
      });
      continue;
    }
    if (payloadType === "custom_tool_call_output") {
      items.push({
        kind: "tool_result",
        call_id: payload.call_id ?? payload.id ?? null,
        output: payload.output ?? null,
        recordIndex,
        blockIndex: 0,
        messageId: `codex-${recordIndex}`,
      });
      continue;
    }
    if (!CODEX_IGNORED_RESPONSE_ITEMS.has(payloadType)) {
      addWarning(warnings, "SCHEMA_DRIFT", "ignored an unknown Codex response item type");
    }
  }
  return { provider: "codex", items, completedAt, abortedAt, warnings };
}

function parseClaude(records, initialWarnings) {
  const warnings = cloneWarnings(initialWarnings);
  const items = [];
  const completedAt = [];
  const abortedAt = [];

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (record?.isSidechain === true || record?.agentId) continue;
    const recordType = record?.type;
    if (recordType === "user") {
      const content = record?.message?.content;
      const messageId = record.uuid || `claude-${recordIndex}`;
      if (typeof content === "string") {
        if (!record.isMeta && !isSyntheticEnvelope(content)) {
          items.push({ kind: "user", text: content, recordIndex, blockIndex: 0, messageId });
        }
        continue;
      }
      if (!Array.isArray(content)) {
        addWarning(warnings, "SCHEMA_DRIFT", "ignored a Claude user message without recognized content");
        continue;
      }
      for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
        const block = content[blockIndex];
        if (block?.type === "text" && typeof block.text === "string") {
          if (!record.isMeta && !isSyntheticEnvelope(block.text)) {
            items.push({ kind: "user", text: block.text, recordIndex, blockIndex, messageId });
          }
        } else if (block?.type === "tool_result") {
          items.push({
            kind: "tool_result",
            call_id: block.tool_use_id ?? null,
            output: block.content ?? null,
            is_error: block.is_error === true,
            recordIndex,
            blockIndex,
            messageId,
          });
        } else if (block?.type !== "image" && block?.type !== "document") {
          addWarning(warnings, "SCHEMA_DRIFT", "ignored an unknown Claude user content block");
        }
      }
      continue;
    }
    if (recordType === "assistant") {
      const content = record?.message?.content;
      if (!Array.isArray(content)) {
        addWarning(warnings, "SCHEMA_DRIFT", "ignored a Claude assistant message without content blocks");
        continue;
      }
      const messageId = record.uuid || record?.message?.id || `claude-${recordIndex}`;
      const stopReason = record?.message?.stop_reason ?? record?.stop_reason;
      const finalHint = stopReason === "end_turn" || stopReason === "stop_sequence" || stopReason === "refusal";
      if (finalHint) completedAt.push(recordIndex);
      if (stopReason === "max_tokens") {
        addWarning(warnings, "INCOMPLETE_ASSISTANT_MESSAGE", "Claude stopped at the token limit");
      }
      for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
        const block = content[blockIndex];
        if (block?.type === "text" && typeof block.text === "string") {
          items.push({
            kind: "assistant",
            text: block.text,
            recordIndex,
            blockIndex,
            messageId,
            finalHint,
          });
        } else if (block?.type === "tool_use") {
          items.push({
            kind: "tool_call",
            name: block.name ?? null,
            call_id: block.id ?? null,
            input: block.input ?? null,
            recordIndex,
            blockIndex,
            messageId,
          });
        } else if (block?.type !== "thinking" && block?.type !== "redacted_thinking") {
          addWarning(warnings, "SCHEMA_DRIFT", "ignored an unknown Claude assistant content block");
        }
      }
      continue;
    }
    if (recordType === "system" && record?.subtype === "turn_aborted") abortedAt.push(recordIndex);
    if (!CLAUDE_IGNORED_RECORDS.has(recordType)) {
      addWarning(warnings, "SCHEMA_DRIFT", "ignored an unknown Claude record type");
    }
  }
  return { provider: "claude", items, completedAt, abortedAt, warnings };
}

function latestTurn(parsed) {
  const userItems = parsed.items.filter((item) => item.kind === "user");
  if (userItems.length === 0) {
    throw new SessionReaderError("NO_USER_TURN", "transcript contains no supported user turn");
  }
  const lastUserItem = userItems[userItems.length - 1];
  const boundary = lastUserItem.recordIndex;
  const userText = userItems
    .filter((item) => item.messageId === lastUserItem.messageId)
    .sort((left, right) => left.blockIndex - right.blockIndex)
    .map((item) => item.text)
    .join("\n");
  const assistantItems = parsed.items.filter(
    (item) => item.kind === "assistant" && item.recordIndex > boundary,
  );
  const finalHintItems = assistantItems.filter((item) => item.finalHint);
  const completedAfterBoundary = parsed.completedAt.some((recordIndex) => recordIndex > boundary);
  const abortedAfterBoundary = parsed.abortedAt.some((recordIndex) => recordIndex > boundary);

  let finalMessageId;
  if (finalHintItems.length > 0) {
    finalMessageId = finalHintItems[finalHintItems.length - 1].messageId;
  } else if (completedAfterBoundary && assistantItems.length > 0) {
    finalMessageId = assistantItems[assistantItems.length - 1].messageId;
  }
  const finalBlocks = finalMessageId
    ? assistantItems
        .filter((item) => item.messageId === finalMessageId)
        .sort((left, right) => left.blockIndex - right.blockIndex)
        .map((item) => item.text)
    : [];
  const finalResponse = finalBlocks.length > 0 ? finalBlocks.join("\n") : null;
  const status = finalResponse
    ? "completed"
    : completedAfterBoundary || abortedAfterBoundary
      ? "no_final_response"
      : "in_progress";

  return { boundary, userText, finalResponse, status };
}

function publicItem(item) {
  if (item.kind === "user" || item.kind === "assistant") {
    return { kind: item.kind, text: item.text };
  }
  if (item.kind === "tool_call") {
    return { kind: item.kind, name: item.name, call_id: item.call_id, input: item.input };
  }
  return {
    kind: item.kind,
    call_id: item.call_id,
    output: item.output,
    ...(item.is_error ? { is_error: true } : {}),
  };
}

function recentItems(items, maxItems, warnings) {
  const selected = [];
  let characters = 0;
  let firstIncluded = items.length;
  for (let index = items.length - 1; index >= 0 && selected.length < maxItems; index -= 1) {
    const item = publicItem(items[index]);
    const size = JSON.stringify(item).length;
    if (characters + size > MAX_CONVERSATION_CHARS) break;
    selected.unshift(item);
    characters += size;
    firstIncluded = index;
  }
  if (selected.length === 0 && items.length > 0) {
    addWarning(
      warnings,
      "ITEM_EXCEEDS_OUTPUT_LIMIT",
      "the newest item exceeded the conversation character limit and was omitted",
    );
  }
  const omittedItems = firstIncluded;
  return {
    items: selected,
    truncated: omittedItems > 0,
    continuation: omittedItems > 0 ? { omitted_items: omittedItems } : null,
  };
}

function recentRawRecords(rawRecords, maxItems, warnings) {
  const selected = [];
  let characters = 0;
  let firstIncluded = rawRecords.length;
  for (let index = rawRecords.length - 1; index >= 0 && selected.length < maxItems; index -= 1) {
    const size = rawRecords[index].length;
    if (characters + size > MAX_CONVERSATION_CHARS) break;
    selected.unshift(rawRecords[index]);
    characters += size;
    firstIncluded = index;
  }
  if (selected.length === 0 && rawRecords.length > 0) {
    addWarning(warnings, "ITEM_EXCEEDS_OUTPUT_LIMIT", "the newest raw record exceeded the character limit");
  }
  const omittedItems = firstIncluded;
  return {
    raw_records: selected,
    truncated: omittedItems > 0,
    continuation: omittedItems > 0 ? { omitted_records: omittedItems } : null,
  };
}

export async function readSession(options) {
  const resolved = await resolveSession(options);
  const parsed =
    options.provider === "codex"
      ? parseCodex(resolved.records, resolved.warnings)
      : parseClaude(resolved.records, resolved.warnings);
  const turn = latestTurn(parsed);
  const base = {
    provider: options.provider,
    session_id: resolved.sessionId,
    mode: options.mode,
    status: turn.status,
    source_path: resolved.sourcePath,
  };

  if (options.mode === "latest-turn") {
    return {
      ...base,
      user_text: turn.userText,
      final_response: turn.finalResponse,
      items: [],
      truncated: false,
      warnings: parsed.warnings,
    };
  }
  if (options.mode === "conversation") {
    const warnings = cloneWarnings(parsed.warnings);
    const selected = recentItems(parsed.items, options.maxItems, warnings);
    return { ...base, ...selected, warnings };
  }
  const warnings = cloneWarnings(parsed.warnings);
  const selected = recentRawRecords(resolved.rawRecords, options.maxItems, warnings);
  return { ...base, ...selected, warnings };
}

function renderText(result) {
  const provenance = [
    `Provider: ${result.provider}`,
    `Session: ${result.session_id}`,
    `Status: ${result.status}`,
    `Source: ${result.source_path}`,
  ].join("\n");
  if (result.mode === "latest-turn") {
    return `${provenance}\n\n${result.final_response ?? "No final response is available."}`;
  }
  if (result.mode === "raw") {
    return `${provenance}\n\n${result.raw_records.join("\n")}`;
  }
  return `${provenance}\n\n${result.items.map((item) => JSON.stringify(item)).join("\n")}`;
}

function helpText() {
  return `Usage:
  node scripts/read-session.mjs --provider <codex|claude> (--session-id <id> | --session-path <path>) [options]

Options:
  --mode <latest-turn|conversation|raw>  Default: latest-turn
  --format <json|text>                   Default: json
  --max-items <n>                        Recent item limit; default: ${DEFAULT_MAX_ITEMS}
  --root <path>                          Override provider search root; repeatable
  --cwd <path>                           Resolve duplicate Claude sessions by exact cwd
  --help                                 Show this help`;
}

function renderError(error, format) {
  const code = error instanceof SessionReaderError ? error.code : "INTERNAL_ERROR";
  const message = error instanceof SessionReaderError ? error.message : "unexpected reader failure";
  if (format === "text") return `ERROR ${code}: ${message}`;
  return JSON.stringify({ error: { code, message } }, null, 2);
}

async function main() {
  let format = "json";
  const formatIndex = process.argv.indexOf("--format");
  if (formatIndex >= 0 && process.argv[formatIndex + 1] === "text") format = "text";
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${helpText()}\n`);
      return;
    }
    const result = await readSession(options);
    process.stdout.write(`${options.format === "json" ? JSON.stringify(result, null, 2) : renderText(result)}\n`);
  } catch (error) {
    process.stdout.write(`${renderError(error, format)}\n`);
    process.exitCode = 1;
  }
}

async function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    const [invokedPath, modulePath] = await Promise.all([
      realpath(process.argv[1]),
      realpath(fileURLToPath(import.meta.url)),
    ]);
    return invokedPath === modulePath;
  } catch {
    return false;
  }
}

if (await isDirectExecution()) await main();

export { SessionReaderError };
