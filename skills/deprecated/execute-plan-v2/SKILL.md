---
name: execute-plan-v2
description: 명시적으로 호출되었을 때 기존 plan Markdown을 실제 작업으로 실행합니다. 모든 작업은 git worktree에서 격리되어 수행되며, 원본 작업 디렉토리와 브랜치는 절대 건드리지 않습니다. 완료 후 사용자가 직접 머지 여부를 결정합니다.
disable-model-invocation: true
---

# Execute Plan Skill (v2)

This skill is intended for explicit invocation, for example:

- `/skill:execute-plan-v2 .plan/2026-...md`

It is an execution workflow for an existing plan document. All work is performed in an isolated git worktree, keeping the original working directory and branch completely untouched.

## Primary Outcome

Implement the plan document in an isolated worktree, then hand off the result for the user to review and merge.

## Non-Negotiable Rules

1. Read the referenced plan document fully before changing files.
2. **All file changes happen inside the worktree, never in the original directory.**
3. Do not implement work that is outside the plan unless the user explicitly approves it.
4. Inspect only files clearly needed to execute the plan.
5. Do not edit, overwrite, or update the plan document unless the user explicitly asks.
6. Run validation without asking only when the action is obvious, low-risk, project-local, and does not require network access or installation.
7. If validation or any next step is unclear or may expand scope, stop and ask the user.
8. **Never merge to the original branch.** Always hand off for the user to decide.

## Workflow

### 1. Load and Understand the Plan

1. Read the plan document completely.
2. Identify:
   - requested outcome
   - assumptions and resolved ambiguities
   - files or areas mentioned in `Context Reviewed`
   - slicing strategy and slice structure (or flat checklist)
   - `Done when` for each slice
   - out-of-scope items and `Noticed But Not Touching`
   - validation section
3. If the plan is missing, unreadable, internally contradictory, or materially ambiguous, stop and ask for clarification.

Do not start implementation until the plan is understood.

### 2. Create Isolated Worktree

Before making any changes:

```bash
# Record current state
ORIGINAL_BRANCH=$(git branch --show-current)
ORIGINAL_DIR=$(pwd)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
WORKTREE_NAME="exec-${TIMESTAMP}"
WORKTREE_PATH=".worktrees/${WORKTREE_NAME}"

# Create worktree with new branch
mkdir -p .worktrees
git worktree add "${WORKTREE_PATH}" -b "${WORKTREE_NAME}"

# Move to worktree
cd "${WORKTREE_PATH}"
```

**Important:**
- All subsequent file operations happen inside `${WORKTREE_PATH}`
- The original directory remains completely unchanged
- The worktree starts with a clean state (no dirty files)

If worktree creation fails (e.g., uncommitted changes block branch creation), report the error and stop.

### 3. Restate Scope Briefly

Before making changes, briefly state the intended implementation scope when useful, especially if:

- the plan is non-trivial or multi-slice
- there are risks or tradeoffs in the plan

Keep this short. Do not turn it into a new planning phase.

### 4. Inspect Context Surgically

Inspect only project-local files needed for the planned changes.

Allowed by default:

- files explicitly named in the plan
- nearby files needed to match style or APIs
- obvious project metadata when directly relevant

Do not inspect by default:

- `node_modules/`, vendor directories, generated artifacts, caches
- unrelated source areas
- parent directories or external paths

If deeper inspection seems necessary, stop and ask with options.

### 5. Implement by Slice

Execute slices sequentially. For each slice:

1. **Implement** the slice's checklist items with minimal, targeted edits.
2. **Run the slice's verify checks** if they are obvious and low-risk.
3. **Commit** with message: `slice N: <slice goal>`
4. **If verify fails**, stop immediately and report. Do not proceed to the next slice.
5. **Proceed to the next slice** without waiting for user confirmation.

Implementation guidelines:

- Prefer the existing project style.
- Avoid opportunistic refactors.
- Avoid formatting unrelated code.
- Do not add abstractions unless the plan explicitly requires them.
- If implementation reveals the plan is wrong or incomplete, stop and explain instead of improvising.
- Respect `Noticed But Not Touching` — do not fix issues listed there.

### 6. Validation

After all slices complete, run final validation if:

- the exact command is explicit in the plan or obvious from project files
- it does not require network access, installation, or new tooling
- it is unlikely to modify external state

If validation is unclear or multiple options exist, ask the user to choose.

### 7. Report and Hand Off

After completion, return to the original directory and report:

```bash
cd "${ORIGINAL_DIR}"
```

**Report includes:**

```markdown
## 실행 완료

- **Plan**: .plan/2026-...md
- **원본 브랜치**: main
- **Worktree**: .worktrees/exec-20260512-143052
- **Worktree 브랜치**: exec-20260512-143052
- **슬라이스 완료**: 3/3
- **검증**: 통과 (또는 상태)

## 다음 단계

확인:
  cd .worktrees/exec-20260512-143052
  git log --oneline

머지 (squash):
  git merge --squash exec-20260512-143052
  git commit -m "your message"

머지 (commits 유지):
  git merge exec-20260512-143052

버리기:
  git worktree remove .worktrees/exec-20260512-143052
  git branch -D exec-20260512-143052
```

**Never execute the merge.** Let the user decide how to integrate.

### 8. Failure Handling

If a slice fails:

1. Stop immediately
2. Report which slice failed and why
3. Note that commits up to the previous slice are preserved in the worktree
4. Provide cleanup instructions:

```markdown
## 실패

- **실패 슬라이스**: Slice 2
- **원인**: 테스트 실패 - validateInput() 누락

## 복구 옵션

부분 작업 확인:
  cd .worktrees/exec-20260512-143052
  git log --oneline

완전히 버리기:
  git worktree remove .worktrees/exec-20260512-143052
  git branch -D exec-20260512-143052
```

### 9. Prohibited Without Explicit Approval

Do not do any of the following unless the user explicitly approves:

- install dependencies or run network-based tools
- run commands likely to modify external state
- add tooling or config solely for this task
- inspect vendor/generated/cache directories
- read or write files outside the worktree
- perform cleanup or refactoring not in the plan
- merge the worktree branch to the original branch

## Worktree Conventions

| Item | Convention |
|------|------------|
| Directory | `.worktrees/exec-<YYYYMMDD-HHMMSS>` |
| Branch | `exec-<YYYYMMDD-HHMMSS>` |
| Commits | `slice N: <goal>` |
| Cleanup | User's responsibility after merge/discard |

## Response Style

Be concise and explicit. Prefer Korean when the user's request is in Korean.

Do not apologize unless something actually went wrong. If a boundary is hit, explain the reason and provide options.
