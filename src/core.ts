import {
  readdirSync,
  statSync,
  lstatSync,
  readlinkSync,
  mkdirSync,
  symlinkSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// Resolve paths relative to the built file location (dist/core.js → ../skills)
const DIST_DIR = dirname(fileURLToPath(import.meta.url));
export const SOURCE_SKILLS_ROOT = resolve(DIST_DIR, "../skills");

export type TargetKind = "agents" | "claude";
export type SourceCategory = "local" | "imported";

const SOURCE_CATEGORIES: SourceCategory[] = ["local", "imported"];

export type SourceSkill = {
  name: string;
  category: SourceCategory;
  path: string;
  relativePath: string;
};

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
  return listSourceSkillEntries().map((skill) => skill.name);
}

export function listSourceSkillEntries(): SourceSkill[] {
  const skills: SourceSkill[] = [];

  for (const category of SOURCE_CATEGORIES) {
    const categoryRoot = join(SOURCE_SKILLS_ROOT, category);
    let entries;
    try {
      entries = readdirSync(categoryRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        !existsSync(join(categoryRoot, entry.name, "SKILL.md"))
      ) {
        continue;
      }

      skills.push({
        name: entry.name,
        category,
        path: join(categoryRoot, entry.name),
        relativePath: join("skills", category, entry.name),
      });
    }
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );
}

export function findSourceSkill(name: string): SourceSkill | undefined {
  const normalized = name.replace(/\/+$/, "");
  const categoryMatch = normalized.match(/^([^/]+)\/([^/]+)$/);
  const skills = listSourceSkillEntries();

  if (categoryMatch) {
    const [, category, skillName] = categoryMatch;
    return skills.find(
      (skill) => skill.category === category && skill.name === skillName
    );
  }

  const matches = skills.filter((skill) => skill.name === normalized);
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous source skill "${name}". Use one of: ${matches
        .map((skill) => `${skill.category}/${skill.name}`)
        .join(", ")}`
    );
  }

  return matches[0];
}

export function sourceSkillOrThrow(name: string): SourceSkill {
  const skill = findSourceSkill(name);
  if (!skill) {
    throw new Error(`Source skill not found: "${name}"`);
  }
  return skill;
}

function normalizeTarget(targetDir: string, target: string): string {
  return (isAbsolute(target) ? resolve(target) : resolve(targetDir, target))
    .replace(/\/+$/, "");
}

export type SkillStatus = "registered" | "broken" | "external" | "not-symlink";
export type CandidateSkillStatus = SkillStatus | "missing";

export type RegisteredSkill = {
  name: string;
  status: SkillStatus;
  target?: string;
};

export type RemovedBrokenSkill = {
  name: string;
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
  const normalised = normalizeTarget(targetDir, target);
  let expected: SourceSkill | undefined;
  try {
    expected = findSourceSkill(name);
  } catch {
    expected = undefined;
  }
  if (expected && normalised === expected.path.replace(/\/+$/, "")) {
    return { name, status: "registered", target };
  }
  return { name, status: "external", target };
}

export function inspectCandidateSkill(
  targetDir: string,
  name: string
): { name: string; status: CandidateSkillStatus; target?: string } {
  const linkPath = join(targetDir, name);
  try {
    lstatSync(linkPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { name, status: "missing" };
  }

  return inspectRegisteredSkill(targetDir, name);
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

export function removeBrokenSkillLinks(targetDir: string): RemovedBrokenSkill[] {
  const removed: RemovedBrokenSkill[] = [];

  for (const entry of listRegisteredSkills(targetDir)) {
    if (entry.status !== "broken") continue;

    unlinkSync(join(targetDir, entry.name));
    removed.push({ name: entry.name, target: entry.target });
  }

  return removed;
}

export type Scope = "root" | "project";

export function addSkill(
  name: string,
  scope: Scope,
  target: TargetKind = "agents"
): SourceSkill {
  const sourceSkill = sourceSkillOrThrow(name);
  const src = sourceSkill.path;

  const targetDir =
    scope === "root"
      ? rootTargetDir(target)
      : projectTargetDir(process.cwd(), target);
  const dest = join(targetDir, sourceSkill.name);

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
  return sourceSkill;
}
