---
name: korean-nominal-style
description: Rewrite explicitly scoped Korean developer prose into concise nominal style while preserving its meaning, technical terms, and surrounding structure.
---

# Korean Nominal Style

Rewrite only the text or files the user explicitly places in scope. Support pasted prose and direct file edits.

## Target style

Produce natural Korean 개조식 through semantic compression, not a mechanical `한다` to `함` substitution.

- Prefer compact noun phrases such as `요청 실패 시 최대 3회 재시도`.
- Remove dispensable particles, connective wording, repetition, and sentence endings.
- Use `~함` or `~됨` only when a bare noun phrase would obscure agency, direction, state, or completion.
- Remove terminal periods from nominal-style items unless the surrounding format requires them.
- Keep the result readable; compression is useful only while the original meaning remains intact.

## Preserve

Keep all semantic constraints from the source, especially:

- conditions and exceptions
- negation
- obligation, recommendation, possibility, and other degrees of force
- quantities, limits, and scope
- actors when they affect interpretation
- essential cause, purpose, ordering, and timing

Keep code, identifiers, paths, commands, URLs, quoted text, logs, error messages, UI copy, product names, project terminology, English technical terms, spelling, and capitalization unchanged. Treat content correction as separate work: report a suspected factual error or ambiguity briefly instead of silently changing it.

Preserve the source container, including comment markers, Markdown headings and lists, code fences, indentation, paragraph boundaries, and line structure. Split prose into a list only when it materially improves readability without changing the surrounding document structure.

## Workflow

1. Identify the exact user-scoped prose and the spans that must remain unchanged.
2. Rewrite Korean prose into natural nominal style.
3. Compare source and result for every condition, negation, degree of force, quantity, scope, actor, and causal or temporal relationship.
4. If meaning cannot be preserved confidently, retain the original passage and flag the ambiguity.
5. For pasted text, return the transformed text without unsolicited explanation. For file edits, apply the change and report only the edited files and scope. Provide before-and-after comparisons or rationale only when requested.

## Examples

```text
실패를 안정적인 code 값을 가진 Error로 정규화한다.
→ 안정적인 code 값을 가진 Error로 실패 정규화

탭을 바꿔도 터미널 버퍼가 유지되도록 모든 패널을 마운트한 채 표시만 전환한다.
→ 탭 전환 시 터미널 버퍼 유지를 위해 전 패널 마운트 유지, active 패널만 표시

인증된 사용자에게만 캐시된 결과를 반환한다.
→ 인증된 사용자에 한해 캐시 결과 반환

요청이 실패하면 최대 세 번 다시 시도해야 한다.
→ 요청 실패 시 최대 3회 재시도 필수
```

Over-compression is invalid when it drops meaning. For example, reducing the last two examples to `캐시 결과 반환` or `요청 재시도` loses required constraints.
