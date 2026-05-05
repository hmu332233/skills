#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  listSourceSkills,
  listRegisteredSkills,
  addSkill,
  ROOT_TARGET_DIR,
  projectTargetDir,
} from "./core.js";

const USAGE = `
Usage: minung-skills <command> [options]

Commands:
  available                         List skills available in the source repository
  list [--root] [--project]         List registered skills (default: both)
  add <name> --root|--project       Register a skill as a symlink

Options:
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

function cmdList(args: string[]): void {
  let values: { root?: boolean; project?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        root: { type: "boolean", default: false },
        project: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err: unknown) {
    console.error(`Error: ${(err as Error).message}\n\nUsage: minung-skills list [--root] [--project]`);
    process.exit(1);
  }

  // Show both when neither or both flags are specified
  const showRoot = values.root || (!values.root && !values.project);
  const showProject = values.project || (!values.root && !values.project);

  if (showRoot) {
    console.log("[root] ~/.agents/skills");
    const entries = listRegisteredSkills(ROOT_TARGET_DIR);
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
    const projDir = projectTargetDir();
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
  let values: { root?: boolean; project?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args,
      options: {
        root: { type: "boolean", default: false },
        project: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: true,
    }));
  } catch (err: unknown) {
    console.error(`Error: ${(err as Error).message}\n\nUsage: minung-skills add <name> --root|--project`);
    process.exit(1);
  }

  if (positionals.length === 0) {
    console.error("Error: skill name is required.\n\nUsage: minung-skills add <name> --root|--project");
    process.exit(1);
  }

  if (positionals.length > 1) {
    console.error(
      `Error: only one skill name is allowed, got: ${positionals.join(", ")}\n\nUsage: minung-skills add <name> --root|--project`
    );
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

  const name = positionals[0];
  const scope = values.root ? "root" : "project";

  try {
    addSkill(name, scope);
    const label =
      scope === "root" ? "~/.agents/skills" : `.agents/skills`;
    console.log(`✓ Registered "${name}" → ${label}/${name}`);
  } catch (err: unknown) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
