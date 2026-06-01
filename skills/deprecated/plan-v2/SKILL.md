---
name: plan-v2
description: 구현 전에 작업 계획을 세워 달라는 요청이 있을 때 사용합니다. 모호한 요구사항을 먼저 명확히 하고, 관련 프로젝트 파일을 검토한 뒤, 기존 계획 파일을 덮어쓰지 않고 현재 작업 디렉토리의 .plan 아래에 신중하고 최소한이며 검증 가능한 Markdown 계획을 새로 작성합니다.
disable-model-invocation: true
---

# Plan Skill (v2)

Use this skill for `/skill:plan-v2 <requirement>` requests. This is a planning workflow, not an implementation workflow.

Bias toward caution over speed. For trivial requests, use judgment, but do not silently assume important details.

## Primary Outcome

Create a new Markdown plan file under `.plan/` in the current working directory after the requirement is clear and relevant project context has been reviewed.

The plan should help avoid common coding mistakes by making assumptions, tradeoffs, scope, success criteria, and verification explicit before implementation begins.

## Non-Negotiable Rules

1. Do not implement the requested change while running this skill.
2. Do not create a `.plan` file until material ambiguity is resolved.
3. If something important is unclear, stop, name what is unclear, and ask concise clarifying questions.
4. If multiple plausible interpretations exist, present them instead of choosing silently.
5. Never overwrite, replace, or truncate existing plan files unless the user explicitly asks to modify that exact file.
6. Use `write` only for new plan files. Use `edit` on existing plan files only when explicitly requested.
7. `.plan/` is relative to the current working directory where Pi is running, not relative to this skill's package directory.

## Workflow

### 1. Think Before Planning

Before reading many files or writing a plan, inspect the user's request for:

- missing target project, feature, command, behavior, or files
- missing constraints, non-goals, compatibility requirements, or deadlines
- missing validation or acceptance criteria
- multiple plausible interpretations
- requests that appear broader or more complex than necessary

If details are missing and material to the plan:

1. State the uncertainty plainly.
2. Ask the minimum number of clarifying questions.
3. Stop. Do not create a plan file yet.

If the request is clear enough to plan safely:

- State any assumptions in the plan.
- Surface relevant tradeoffs.
- Prefer the simplest approach that satisfies the request.
- Push back in the plan if a requested approach appears unnecessarily complex or risky.

### 2. Review Context Surgically

After ambiguity is resolved, inspect only the files needed to create a concrete plan.

Guidelines:

- Search/list files to locate the relevant area.
- Read relevant files before proposing code changes.
- Do not inspect unrelated areas just because they are nearby.
- Do not propose refactors, cleanup, formatting changes, or abstractions unrelated to the request.
- If unrelated dead code or issues are noticed, record them in `Noticed But Not Touching` instead of planning to change them.
- Record every reviewed path in the plan under `Context Reviewed` with a short reason.

### 3. Plan for Simplicity

The plan must describe the minimum work needed to satisfy the clarified requirement.

Avoid:

- features beyond what was requested
- abstractions for single-use code
- speculative flexibility or configurability
- broad refactors
- error handling for impossible or irrelevant scenarios
- cleanup of code not touched by the requested change

Every planned change should trace directly to the user's request. If a step does not trace to the request, remove it or mark it explicitly as optional/out of scope.

Simplicity heuristics:

- 비슷한 코드 3줄은, 한 번만 쓰일 추상화보다 낫다.
- naive 하지만 명백히 옳은 버전을 먼저 계획하고, 추상화는 테스트로 정합성이 입증된 뒤로 미룬다.

### 4. Choose a Slicing Strategy

When the work naturally divides into 2+ increments, choose one of the following strategies and state it in the plan:

| Strategy | When to use | Key property |
|----------|-------------|--------------|
| **Vertical** (default) | Most tasks | Each slice delivers end-to-end working functionality (DB → API → UI) |
| **Contract-First** | Backend/frontend need to develop in parallel | Slice 0 defines types/schema/API contract; subsequent slices implement against it |
| **Risk-First** | High uncertainty in one area (new protocol, external dependency, unfamiliar tech) | Slice 1 proves the riskiest assumption; later slices build on proven ground |

Rules:

- Default to **Vertical** unless there is a clear reason for another strategy.
- If using **Contract-First**, Slice 0 must produce a concrete artifact (types file, OpenAPI spec, schema) and state its path.
- If using **Risk-First**, Slice 1 must state the hypothesis being tested and the failure condition that would halt subsequent slices.
- Each slice must be independently mergeable: after completing a slice, the project should build and available tests should pass. If no tests exist or validation is impractical, explicitly mark the slice as "manual verification only".
- Each slice should be independently revertable when practical.

If the work is small enough to be a single slice (e.g., ≤3 files changed, single function modification), use a flat checklist without slice headers or the `Slicing strategy` line.

### 5. Make Success Verifiable

Transform the task into concrete, verifiable goals.

For each meaningful plan step, include a verification check when possible:

```text
- [ ] 1. <step> → verify: <check>
```

Examples:

- `Add validation` → `write or update tests for invalid inputs, then make them pass`
- `Fix bug` → `reproduce with a test or command, then verify it passes`
- `Refactor` → `confirm tests pass before and after`

If success criteria are weak or unknowable from the request, ask for clarification before creating the plan.

## Plan File Creation

### Directory

Create `.plan/` in the current working directory if it does not exist.

Before writing a plan file:

1. Inspect existing `.plan` files.
2. Check for filename collisions.
3. Choose a unique filename.

### Filename Rule

Use this pattern:

```text
.plan/YYYY-MM-DD-HHMM-<slug>.md
```

Examples:

```text
.plan/2026-05-04-1530-add-plan-skill.md
.plan/2026-05-04-1530-add-plan-skill-2.md
.plan/2026-05-04-1530-add-plan-skill-3.md
```

Rules:

- Use the current local date and time for `YYYY-MM-DD-HHMM`.
- Create a short lowercase kebab-case slug from the clarified requirement.
- If the filename exists, append `-2`, `-3`, and so on until a unique filename is found.
- Do not reuse an existing filename unless the user explicitly requested overwriting that exact file.

## Plan Document Template

Use this Markdown structure:

```md
---
title: <short title>
createdAt: <ISO timestamp>
status: planned
source: /skill:plan-v2
---

# <Title>

## Original Request

<user's original request>

## Clarified Requirement

<refined and actionable requirement>

## Assumptions

- <explicit assumption, or "None">

## Ambiguities Resolved

- <resolved ambiguity or decision, or "None">

## Tradeoffs / Pushback

- <tradeoff, simpler alternative, or reason no pushback is needed>

## Context Reviewed

- `<path>` — <why it was reviewed>

## Plan

> Slicing strategy: <vertical | contract-first | risk-first> — <one-line rationale if not vertical>

### Slice 1: <one-line goal — what works when this slice is done>

- [ ] 1.1 <step> → verify: <check>
- [ ] 1.2 <step> → verify: <check>

- **Done when**: <user/system-observable outcome>

### Slice 2: <one-line goal>

- [ ] 2.1 <step> → verify: <check>

- **Done when**: <outcome>

<!-- If single-slice, omit the Slicing strategy line, slice headers, Done when, and Rollback.
     Use a flat checklist instead:
- [ ] 1. <step> → verify: <check>
- [ ] 2. <step> → verify: <check>
-->

## Out of Scope

- <related work intentionally excluded from this plan, or "None">

## Noticed But Not Touching

- <issues discovered during context review that are unrelated to this task>
- <format: `path` — issue — recommendation (e.g., "separate task")>
- <or "None">

## Risks / Considerations

- <risk or consideration>

## Validation

- <overall validation method after all slices complete>

## Self-check (planner)

- [ ] 각 슬라이스가 끝난 시점에 빌드/테스트가 통과하는가?
- [ ] 각 step 이 단 하나의 논리적 변경만 담는가?
- [ ] 미완성 기능을 머지해야 하면 feature flag 가 필요한가?
- [ ] 새로 도입한 동작의 기본값이 안전(보수적/opt-in)한가?
- [ ] 추상화가 현재 작업이 아닌 "미래 가능성" 때문에 도입되지는 않았는가?
```

Notes:

- Keep `## Plan` as a Markdown task list so later tooling can parse it.
- If slicing strategy is **contract-first**, ensure Slice 0 names the contract artifact path.
- If slicing strategy is **risk-first**, ensure Slice 1 states the hypothesis and halt condition.
- 실행은 git worktree에서 격리되어 수행됩니다. 자세한 내용은 execute-plan 스킬 참고.

## Response After Creating the Plan

After writing the new plan file, respond with:

- the path of the created plan file
- a brief summary of the clarified scope
- slicing strategy chosen and why (if multi-slice)
- key assumptions or tradeoffs
- validation notes

Do not start implementation unless the user separately asks for it.
