# Minung Skills

This context describes the language used by the skill repository and its CLI.

## Language

**Source Skill Catalog**:
The repository-owned collection of source skills under `skills/`, organized for maintenance and discovery. Active source skills live under `skills/local/` or `skills/imported/`; excluded skills live under `skills/deprecated/`.
_Avoid_: Registered skills, installed skills

**Local Skill**:
A source skill authored and maintained primarily in this repository for the owner's own use. Local skills live under `skills/local/`.
_Avoid_: Custom skill, my skill

**Imported Skill**:
A source skill brought in from an external source and maintained in this repository, possibly with local modifications. Imported skills live under `skills/imported/`.
_Avoid_: External skill, copied skill

**Skill Provenance**:
The recorded origin of an imported skill, including where it came from and the source revision or hash that was imported. The canonical provenance record lives next to each imported skill; provenance describes source history only and does not describe whether a skill is registered in any target skill set.
_Avoid_: Version note, comment, installed state

**Skill Lock File**:
A maintenance record for the source skill catalog directory. It is not the purpose of the repository and does not describe skill registration state.
_Avoid_: Product state, registration state

**Excluded Catalog Directory**:
A directory under the source skill catalog that is intentionally omitted from discovery and registration flows even if it contains skills. Excluded directories are not exposed through fallback CLI options.
_Avoid_: Category

**Registered Skill Set**:
The target collection of skill entries under an agent-visible skills directory, such as `.agents/skills` or `.claude/skills`. It stays flat by skill name even when the source catalog is categorized.
_Avoid_: Source skills, catalog

**Skill Registration**:
Creating a target entry that points at a source skill so an agent can discover and use it. In this repository, registration is conceptually distinct from copying skill files.
_Avoid_: Copy, duplicate, vendor, install

**UI-first CLI**:
A command-line interface whose default entrypoint opens an interactive registration flow while still keeping non-interactive commands available for automation and fallback use.
_Avoid_: UI-only CLI
