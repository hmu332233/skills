import {
  readdirSync,
  statSync,
  lstatSync,
  readlinkSync,
  mkdirSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// Resolve paths relative to the built file location (dist/core.js → ../skills)
const DIST_DIR = dirname(fileURLToPath(import.meta.url));
export const SOURCE_SKILLS_ROOT = resolve(DIST_DIR, "../skills");

export type TargetKind = "agents" | "claude";

const TARGET_SKILLS_DIR: Record<TargetKind, string> = {
  agents: ".agents/skills",
  claude: ".claude/skills",
};

export function rootTargetDir(target: TargetKind = "agents"): string {
  return resolve(homedir(), TARGET_SKILLS_DIR[target]);
}

export const ROOT_TARGET_DIR = rootTargetDir("agents");

export function projectTargetDir(
  cwd: string = process.cwd(),
  target: TargetKind = "agents"
): string {
  return resolve(cwd, TARGET_SKILLS_DIR[target]);
}

export function listSourceSkills(): string[] {
  try {
    return readdirSync(SOURCE_SKILLS_ROOT, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          existsSync(join(SOURCE_SKILLS_ROOT, e.name, "SKILL.md"))
      )
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export type SkillStatus = "valid" | "broken" | "external" | "not-symlink";

export type RegisteredSkill = {
  name: string;
  status: SkillStatus;
  target?: string;
};

export function inspectRegisteredSkill(
  targetDir: string,
  name: string
): RegisteredSkill {
  const linkPath = join(targetDir, name);

  let lstats;
  try {
    lstats = lstatSync(linkPath);
  } catch {
    return { name, status: "broken" };
  }

  if (!lstats.isSymbolicLink()) {
    return { name, status: "not-symlink" };
  }

  let target: string;
  try {
    target = readlinkSync(linkPath);
  } catch {
    return { name, status: "broken" };
  }

  // Check if symlink target actually exists (follows the link)
  try {
    statSync(linkPath);
  } catch {
    return { name, status: "broken", target };
  }

  // Normalise trailing slashes for comparison
  const normalised = target.replace(/\/+$/, "");
  const expected = join(SOURCE_SKILLS_ROOT, name);
  if (normalised === expected) {
    return { name, status: "valid", target };
  }
  return { name, status: "external", target };
}

export function listRegisteredSkills(targetDir: string): RegisteredSkill[] {
  try {
    const entries = readdirSync(targetDir, { withFileTypes: true });
    return entries
      .map((e) => inspectRegisteredSkill(targetDir, e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export type Scope = "root" | "project";

export function addSkill(
  name: string,
  scope: Scope,
  target: TargetKind = "agents"
): void {
  const src = join(SOURCE_SKILLS_ROOT, name);

  // Verify source exists
  try {
    statSync(src);
  } catch {
    throw new Error(`Source skill not found: "${name}"`);
  }

  const targetDir =
    scope === "root"
      ? rootTargetDir(target)
      : projectTargetDir(process.cwd(), target);
  const dest = join(targetDir, name);

  // Ensure target directory exists
  mkdirSync(targetDir, { recursive: true });

  // Check for existing entry via lstat (catches broken symlinks too)
  try {
    lstatSync(dest);
    // lstat succeeded → something exists at dest
    throw new Error(
      `Already exists at: ${dest}\nRemove it manually and re-run to replace.`
    );
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
    // ENOENT → dest does not exist, safe to proceed
  }

  symlinkSync(src, dest, "dir");
}
