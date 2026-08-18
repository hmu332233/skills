#!/usr/bin/env node
import { checkbox, confirm, select, Separator } from "@inquirer/prompts";
import { parseArgs } from "node:util";
import {
  listSourceSkills,
  listSourceSkillEntries,
  listRegisteredSkills,
  inspectCandidateSkill,
  addSkill,
  removeBrokenSkillLinks,
  removeRegisteredSkillLinks,
  rootTargetDir,
  projectTargetDir,
  type TargetKind,
  type Scope,
  type SourceCategory,
  type SourceSkill,
} from "./core.js";

const USAGE = `
Usage: minung-skills <command> [options]

Commands:
  (no command)                       Open the interactive registration UI
  available                         List skills available in the source repository
  list [--root] [--project] [--claude]
                                      List registered skills (default: both .agents scopes)
  add <name...> --root|--project [--claude]
                                      Register one or more skills as symlinks
  add --root|--project [--claude]
                                      Open the interactive UI with a preselected target
  remove [--root|--project] [--claude]
                                      Remove registered skill symlinks via the interactive UI
  clean [--root|--project] [--claude] [--yes]
                                      Remove broken skill symlinks (picks target via UI if no flag)

Options:
  --claude  Use .claude/skills instead of .agents/skills
  --yes     Remove all broken links without prompting
  --help    Show this help message
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await cmdInteractive();
    return;
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
      await cmdAdd(rest);
      break;
    case "remove":
      await cmdRemove(rest);
      break;
    case "clean":
      await cmdClean(rest);
      break;
    default:
      console.error(`Unknown command: "${cmd}"\n\n${USAGE}`);
      process.exit(1);
  }
}

function cmdAvailable(): void {
  const skills = listSourceSkillEntries();
  if (skills.length === 0) {
    console.log("(no skills found)");
    return;
  }

  for (const category of ["local", "imported", "taste"] satisfies SourceCategory[]) {
    const categorySkills = skills.filter((skill) => skill.category === category);
    if (categorySkills.length === 0) continue;
    console.log(`[${category}]`);
    categorySkills.forEach((skill) => console.log(`  ${skill.name}`));
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "registered":
      return "✓ registered";
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
    console.error(
      `Error: ${(err as Error).message}\n\nUsage: minung-skills list [--root] [--project] [--claude]`
    );
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

async function cmdAdd(args: string[]): Promise<void> {
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

  if (values.root && values.project) {
    console.error("Error: specify either --root or --project, not both.");
    process.exit(1);
  }

  if (positionals.length === 0) {
    const scope = values.root ? "root" : values.project ? "project" : undefined;
    const target: TargetKind = values.claude ? "claude" : "agents";
    await cmdInteractive(scope ? { scope, target } : undefined);
    return;
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
      const sourceSkill = addSkill(name, scope, target);
      successes.push(sourceSkill.name);
      console.log(
        `✓ Registered "${sourceSkill.name}" → ${label}/${sourceSkill.name}`
      );
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

  console.log(
    `Summary: ${successes.length} succeeded, ${failures.length} failed.`
  );
  if (successes.length > 0) {
    console.log(`Succeeded: ${successes.join(", ")}`);
  }
  if (failures.length > 0) {
    console.error(`Failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

async function cmdClean(args: string[]): Promise<void> {
  const usage = "Usage: minung-skills clean --root|--project [--claude] [--yes]";
  let values: {
    root?: boolean;
    project?: boolean;
    claude?: boolean;
    yes?: boolean;
  };

  try {
    ({ values } = parseArgs({
      args,
      options: {
        root: { type: "boolean", default: false },
        project: { type: "boolean", default: false },
        claude: { type: "boolean", default: false },
        yes: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err: unknown) {
    console.error(`Error: ${(err as Error).message}\n\n${usage}`);
    process.exit(1);
  }

  if (values.root && values.project) {
    console.error("Error: specify either --root or --project, not both.");
    process.exit(1);
  }

  const destination: Destination =
    !values.root && !values.project
      ? await chooseDestination()
      : {
          scope: values.root ? "root" : "project",
          target: values.claude ? "claude" : "agents",
        };

  await cleanBrokenLinks(destination, { skipConfirmation: values.yes });
}

async function cmdRemove(args: string[]): Promise<void> {
  const usage = "Usage: minung-skills remove [--root|--project] [--claude]";
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
    console.error(`Error: ${(err as Error).message}\n\n${usage}`);
    process.exit(1);
  }

  if (values.root && values.project) {
    console.error("Error: specify either --root or --project, not both.");
    process.exit(1);
  }

  const scope = values.root ? "root" : values.project ? "project" : undefined;
  const destination: Destination = scope
    ? { scope, target: values.claude ? "claude" : "agents" }
    : await chooseDestination({
        message: "Remove from?",
        target: values.claude ? "claude" : undefined,
      });

  await removeRegisteredLinks(destination);
}

type Destination = {
  scope: Scope;
  target: TargetKind;
};

function destinationKey(destination: Destination): string {
  return `${destination.scope}:${destination.target}`;
}

function parseDestinationKey(value: string): Destination {
  const [scope, target] = value.split(":");
  return { scope: scope as Scope, target: target as TargetKind };
}

function destinationLabel(destination: Destination): string {
  return targetLabel(destination.scope, destination.target);
}

function targetDir(destination: Destination): string {
  return destination.scope === "root"
    ? rootTargetDir(destination.target)
    : projectTargetDir(process.cwd(), destination.target);
}

function categoryLabel(category: SourceCategory): string {
  switch (category) {
    case "local":
      return "Local";
    case "imported":
      return "Imported";
    case "taste":
      return "Taste";
  }
}

function candidateStatusLabel(status: string): string {
  switch (status) {
    case "registered":
      return "registered";
    case "broken":
      return "exists: broken";
    case "external":
      return "exists: external";
    case "not-symlink":
      return "exists: not symlink";
    default:
      return status;
  }
}

function groupedSkillChoices(skills: SourceSkill[], destination: Destination) {
  const dir = targetDir(destination);
  const choices: (
    | Separator
    | {
        name: string;
        value: string;
        disabled?: boolean | string;
      }
  )[] = [];

  for (const category of ["local", "imported", "taste"] satisfies SourceCategory[]) {
    const categorySkills = skills.filter((skill) => skill.category === category);
    if (categorySkills.length === 0) continue;

    if (choices.length > 0) choices.push(new Separator());
    choices.push(new Separator(categoryLabel(category)));

    for (const skill of categorySkills) {
      const status = inspectCandidateSkill(dir, skill.name).status;
      const disabled =
        status === "missing" ? undefined : candidateStatusLabel(status);

      choices.push({
        name:
          status === "missing"
            ? skill.name
            : `${skill.name} (${candidateStatusLabel(status)})`,
        value: `${skill.category}/${skill.name}`,
        disabled,
      });
    }
  }

  return choices;
}

function selectableChoiceCount(
  choices: ReturnType<typeof groupedSkillChoices>
): number {
  return choices.filter((choice) => "value" in choice && !choice.disabled)
    .length;
}

function printBlockedSkillSummary(
  skills: SourceSkill[],
  destination: Destination
): void {
  const dir = targetDir(destination);
  console.log(`No selectable skills for ${destinationLabel(destination)}.`);
  console.log("Existing target entries block every source skill:");

  for (const category of ["local", "imported", "taste"] satisfies SourceCategory[]) {
    const categorySkills = skills.filter((skill) => skill.category === category);
    const blocked = categorySkills
      .map((skill) => ({
        skill,
        status: inspectCandidateSkill(dir, skill.name).status,
      }))
      .filter((entry) => entry.status !== "missing");

    if (blocked.length === 0) continue;

    console.log(`[${category}]`);
    for (const entry of blocked) {
      console.log(
        `  ${entry.skill.name}  [${candidateStatusLabel(entry.status)}]`
      );
    }
  }
}

function brokenSkillsForDestination(destination: Destination) {
  return listRegisteredSkills(targetDir(destination)).filter(
    (entry) => entry.status === "broken"
  );
}

function registeredSkillsForDestination(destination: Destination) {
  const registeredNames = new Set(
    listRegisteredSkills(targetDir(destination))
      .filter((entry) => entry.status === "registered")
      .map((entry) => entry.name)
  );

  return listSourceSkillEntries().filter((skill) =>
    registeredNames.has(skill.name)
  );
}

function groupedRegisteredSkillChoices(skills: SourceSkill[]) {
  const choices: (Separator | { name: string; value: string })[] = [];

  for (const category of ["local", "imported", "taste"] satisfies SourceCategory[]) {
    const categorySkills = skills.filter((skill) => skill.category === category);
    if (categorySkills.length === 0) continue;

    if (choices.length > 0) choices.push(new Separator());
    choices.push(new Separator(categoryLabel(category)));
    choices.push(
      ...categorySkills.map((skill) => ({
        name: skill.name,
        value: skill.name,
      }))
    );
  }

  return choices;
}

async function removeRegisteredLinks(destination: Destination): Promise<void> {
  const skills = registeredSkillsForDestination(destination);
  if (skills.length === 0) {
    console.log(
      `No registered skill links in ${destinationLabel(destination)}.`
    );
    return;
  }

  const selected = await checkbox({
    message: `Select skills to remove from ${destinationLabel(destination)}`,
    choices: groupedRegisteredSkillChoices(skills),
    required: true,
    pageSize: 20,
  });

  const proceed = await confirm({
    message: `Remove ${selected.join(", ")} from ${destinationLabel(
      destination
    )}?`,
    default: false,
  });

  if (!proceed) {
    console.log("Cancelled.");
    return;
  }

  const result = removeRegisteredSkillLinks(targetDir(destination), selected);

  if (result.removed.length > 0) {
    console.log(`Removed ${result.removed.length} skill link(s):`);
    for (const entry of result.removed) {
      console.log(`  ${entry.name}`);
    }
  }

  if (result.skipped.length > 0) {
    console.error(`Skipped ${result.skipped.length} skill link(s):`);
    for (const entry of result.skipped) {
      const detail = entry.error ?? `status changed to ${entry.status}`;
      console.error(`  ${entry.name}: ${detail}`);
    }
    process.exit(1);
  }
}

function printBrokenSkills(destination: Destination): void {
  const broken = brokenSkillsForDestination(destination);
  if (broken.length === 0) {
    console.log(`No broken skill links in ${destinationLabel(destination)}.`);
    return;
  }

  console.log(`Broken skill links in ${destinationLabel(destination)}:`);
  for (const entry of broken) {
    console.log(`  ${entry.name}${entry.target ? ` -> ${entry.target}` : ""}`);
  }
}

async function cleanBrokenLinks(
  destination: Destination,
  options: { skipConfirmation?: boolean } = {}
): Promise<boolean> {
  const broken = brokenSkillsForDestination(destination);

  if (broken.length === 0) {
    console.log(`No broken skill links in ${destinationLabel(destination)}.`);
    return false;
  }

  printBrokenSkills(destination);

  if (options.skipConfirmation) {
    return printRemoved(removeBrokenSkillLinks(targetDir(destination)));
  }

  const selected = await checkbox({
    message: `Select broken links to remove from ${destinationLabel(
      destination
    )}`,
    choices: broken.map((entry) => ({
      name: `${entry.name}${entry.target ? ` -> ${entry.target}` : ""}`,
      value: entry.name,
      checked: true,
    })),
  });

  if (selected.length === 0) {
    console.log("No links removed.");
    return false;
  }

  return printRemoved(removeBrokenSkillLinks(targetDir(destination), selected));
}

function printRemoved(removed: ReturnType<typeof removeBrokenSkillLinks>): boolean {
  if (removed.length === 0) {
    console.log("No links removed.");
    return false;
  }

  console.log(`Removed ${removed.length} broken link(s):`);
  for (const entry of removed) {
    console.log(`  ${entry.name}${entry.target ? ` -> ${entry.target}` : ""}`);
  }

  return true;
}

async function chooseDestination(
  options: { message?: string; target?: TargetKind } = {}
): Promise<Destination> {
  const choices = [
    {
      name: "Project .agents/skills",
      value: destinationKey({ scope: "project", target: "agents" }),
      target: "agents" as const,
    },
    {
      name: "Global ~/.agents/skills",
      value: destinationKey({ scope: "root", target: "agents" }),
      target: "agents" as const,
    },
    {
      name: "Project .claude/skills",
      value: destinationKey({ scope: "project", target: "claude" }),
      target: "claude" as const,
    },
    {
      name: "Global ~/.claude/skills",
      value: destinationKey({ scope: "root", target: "claude" }),
      target: "claude" as const,
    },
  ].filter((choice) => !options.target || choice.target === options.target);

  const key = await select({
    message: options.message ?? "Register to?",
    choices,
  });

  return parseDestinationKey(key);
}

async function cmdInteractive(initialDestination?: Destination): Promise<void> {
  const skills = listSourceSkillEntries();
  if (skills.length === 0) {
    console.log("(no skills found)");
    return;
  }

  const destination = initialDestination ?? (await chooseDestination());
  let choices = groupedSkillChoices(skills, destination);
  if (selectableChoiceCount(choices) === 0) {
    printBlockedSkillSummary(skills, destination);
    if (brokenSkillsForDestination(destination).length === 0) return;

    const cleaned = await cleanBrokenLinks(destination);
    if (!cleaned) return;

    choices = groupedSkillChoices(skills, destination);
    if (selectableChoiceCount(choices) === 0) {
      printBlockedSkillSummary(skills, destination);
      return;
    }
  }

  const selected = await checkbox({
    message: `Select skills for ${destinationLabel(destination)}`,
    choices,
    required: true,
    pageSize: 20,
  });

  const proceed = await confirm({
    message: `Register ${selected.length} skill(s) to ${destinationLabel(
      destination
    )}?`,
    default: true,
  });

  if (!proceed) {
    console.log("Cancelled.");
    return;
  }

  const successes: string[] = [];
  const failures: string[] = [];

  for (const name of selected) {
    try {
      const sourceSkill = addSkill(name, destination.scope, destination.target);
      successes.push(sourceSkill.name);
      console.log(
        `✓ Registered "${sourceSkill.name}" → ${destinationLabel(
          destination
        )}/${sourceSkill.name}`
      );
    } catch (err: unknown) {
      failures.push(name);
      console.error(`✗ Failed "${name}": ${(err as Error).message}`);
    }
  }

  console.log(
    `Summary: ${successes.length} succeeded, ${failures.length} failed.`
  );
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  if ((err as Error).name === "ExitPromptError") {
    console.log("Cancelled.");
    return;
  }

  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
