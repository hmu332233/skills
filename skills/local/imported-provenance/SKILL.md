---
name: imported-provenance
description: Audit, backfill, and sync provenance.json records for imported skills in this repository, using skills-lock.json as the source of truth. Use when an imported skill is missing provenance.json, when provenance fields drift from the lock file, after importing a new external skill, or when the user mentions provenance, imported skills, or skills-lock.json.
disable-model-invocation: true
---

# Imported Skill Provenance

Each **Imported Skill** under `skills/imported/<skill>/` is the pair `SKILL.md` + `provenance.json`. The `provenance.json` is the canonical **Skill Provenance** record — where the skill came from and the source revision/hash imported. `skills-lock.json` at the repo root is the **Skill Lock File**, a catalog-wide maintenance record. See `CONTEXT.md` for the exact domain definitions and `README.md` for the directory layout.

## Source of truth

`skills-lock.json` is authoritative. Every consistency operation derives the expected provenance from the lock entry:

| provenance.json field | derived from lock entry |
| --- | --- |
| `source` | `source` |
| `sourceType` | `sourceType` |
| `sourcePath` | `skillPath` with trailing `/SKILL.md` removed |
| `importedRevision` | `null` (lock does not record it) |
| `importedHash` | `computedHash` |

**The hash is not recomputed locally.** `computedHash`/`importedHash` is taken against the upstream source content at import time and cannot be reproduced from the files in this repo. Never hash local files to "verify" provenance — trust the lock file. The external import tool that produced the lock file lives outside this repo.

## Quick start

Run all commands from the repo root (the script also auto-finds the root by walking up to `skills-lock.json`).

```sh
# Report only — exits non-zero if anything is missing or drifted
node skills/local/imported-provenance/scripts/audit.mjs

# Backfill: write provenance.json for entries that are MISSING or malformed.
# Leaves field mismatches untouched (they may be intentional local edits).
node skills/local/imported-provenance/scripts/audit.mjs --backfill

# Sync: rewrite EVERY provenance.json from the lock file, repairing mismatches too.
node skills/local/imported-provenance/scripts/audit.mjs --sync
```

`--json` prints machine-readable results for any mode.

## Statuses

| status | meaning | fixed by |
| --- | --- | --- |
| `ok` | matches lock entry | — |
| `missing` | no provenance.json | `--backfill` or `--sync` |
| `invalid-json` | provenance.json won't parse | `--backfill` or `--sync` |
| `mismatch` | a field disagrees with the lock | `--sync` only |
| `no-lock-entry` | directory has no lock entry | see Add, below |

A `mismatch` is reported but **not** repaired by `--backfill`, because a deliberate local edit looks identical to drift — review it before forcing `--sync`. A `no-lock-entry` cannot be fixed from the lock file; the skill predates or sidesteps the import tool.

## Adding a newly imported skill

The import tool is external, so a hand-imported skill may land without a lock entry or provenance. To register it:

1. Add an entry to `skills-lock.json` under `skills`:
   ```json
   "<skill>": {
     "source": "<owner/repo>",
     "sourceType": "github",
     "skillPath": "<path within source>/SKILL.md",
     "computedHash": "<hash from the import>"
   }
   ```
2. Run `--backfill` to generate `skills/imported/<skill>/provenance.json` from it.
3. Run a plain `audit` to confirm `ok`.

If you have no real `computedHash` (the skill was copied by hand), record that honestly rather than inventing one — flag it to the user and decide whether the skill belongs under `skills/imported/` at all.

## Workflow checklist

- [ ] Run plain `audit` first; read the statuses.
- [ ] `missing` / `invalid-json` only → `--backfill`.
- [ ] `mismatch` present → inspect the diff, confirm it's drift (not an intended edit), then `--sync`.
- [ ] `no-lock-entry` → follow Add, or move the skill out of `imported/`.
- [ ] Re-run plain `audit` to confirm exit 0.
