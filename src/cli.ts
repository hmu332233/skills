#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  listSourceSkills,
  listRegisteredSkills,
  addSkill,
  rootTargetDir,
  projectTargetDir,
  type TargetKind,
  type Scope,
} from "./core.js";

const USAGE = `
Usage: minung-skills <command> [options]

Commands:
  available                         List skills available in the source repository
  list [--root] [--project] [--claude]
                                      List registered skills (default: both .agents scopes)
  add <name...> --root|--project [--claude]
                                      Register one or more skills as symlinks

Options:
  --claude  Use .claude/skills instead of .agents/skills
  --help    Show this help message
`.trim();

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(USAGE);
    process.exit(1);
  }

  if (args[0] === "--help" || args[0] === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  const [cmd, ...rest] = args;

  switch (cmd) {
    case "available":
      cmdAvailable();
      break;
    case "list":
      cmdList(rest);
      break;
    case "add":
      cmdAdd(rest);
      break;
    default:
      console.error(`Unknown command: "${cmd}"\n\n${USAGE}`);
      process.exit(1);
  }
}

function cmdAvailable(): void {
  const skills = listSourceSkills();
  if (skills.length === 0) {
    console.log("(no skills found)");
  } else {
    skills.forEach((s) => console.log(s));
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "valid":
      return "✓";
    case "broken":
      return "✗ broken";
    case "external":
      return "⚠ external";
    case "not-symlink":
      return "⚠ not-symlink";
    default:
      return status;
  }
}

function targetLabel(scope: Scope, target: TargetKind): string {
  const dir = target === "claude" ? ".claude/skills" : ".agents/skills";
  return scope === "root" ? `~/${dir}` : dir;
}

function cmdList(args: string[]): void {
  let values: { root?: boolean; project?: boolean; claude?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        root: { type: "boolean", default: false },
        project: { type: "boolean", default: false },
        claude: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err: unknown) {
    console.error(`Error: ${(err as Error).message}\n\nUsage: minung-skills list [--root] [--project] [--claude]`);
    process.exit(1);
  }

  // Show both when neither or both flags are specified
  const showRoot = values.root || (!values.root && !values.project);
  const showProject = values.project || (!values.root && !values.project);
  const target: TargetKind = values.claude ? "claude" : "agents";

  if (showRoot) {
    console.log(`[root] ${targetLabel("root", target)}`);
    const entries = listRegisteredSkills(rootTargetDir(target));
    if (entries.length === 0) {
      console.log("  (empty)");
    } else {
      for (const e of entries) {
        console.log(`  ${e.name}  [${statusLabel(e.status)}]`);
      }
    }
  }

  if (showProject) {
    if (showRoot) console.log();
    const projDir = projectTargetDir(process.cwd(), target);
    console.log(`[project] ${projDir}`);
    const entries = listRegisteredSkills(projDir);
    if (entries.length === 0) {
      console.log("  (empty)");
    } else {
      for (const e of entries) {
        console.log(`  ${e.name}  [${statusLabel(e.status)}]`);
      }
    }
  }
}

function cmdAdd(args: string[]): void {
  const usage = "Usage: minung-skills add <name...> --root|--project [--claude]";
  let values: { root?: boolean; project?: boolean; claude?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      options: {
        root: { type: "boolean", default: false },
        project: { type: "boolean", default: false },
        claude: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: true,
    }));
  } catch (err: unknown) {
    console.error(`Error: ${(err as Error).message}\n\n${usage}`);
    process.exit(1);
  }

  if (positionals.length === 0) {
    console.error(`Error: at least one skill name is required.\n\n${usage}`);
    process.exit(1);
  }

  if (values.root && values.project) {
    console.error("Error: specify either --root or --project, not both.");
    process.exit(1);
  }

  if (!values.root && !values.project) {
    console.error("Error: specify either --root or --project.");
    process.exit(1);
  }

  const scope: Scope = values.root ? "root" : "project";
  const target: TargetKind = values.claude ? "claude" : "agents";
  const label = targetLabel(scope, target);
  const successes: string[] = [];
  const failures: string[] = [];

  for (const name of positionals) {
    try {
      addSkill(name, scope, target);
      successes.push(name);
      console.log(`✓ Registered "${name}" → ${label}/${name}`);
    } catch (err: unknown) {
      failures.push(name);
      console.error(`✗ Failed "${name}": ${(err as Error).message}`);
    }
  }

  if (failures.length > 0) {
    const available = listSourceSkills();
    if (available.length > 0) {
      console.error(`Available skills: ${available.join(", ")}`);
    }
  }

  console.log(`Summary: ${successes.length} succeeded, ${failures.length} failed.`);
  if (successes.length > 0) {
    console.log(`Succeeded: ${successes.join(", ")}`);
  }
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main();
