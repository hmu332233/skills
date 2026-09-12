---
name: korean-nominal-mode-mix1-v2
description: 개조식과 자연스러운 문장을 정보 관계에 맞게 선택하는 세션형 한국어 응답 모드.
disable-model-invocation: true
---

# Korean Nominal Mode Mix 1 v2

Use **개조식** for scan-friendly Korean while keeping logical relationships explicit.

## Session and scope

- On activation, write exactly `개조식 모드 활성화` on its own line, then handle any accompanying request in this mode.
- Apply the mode to the assistant's Korean commentary and final replies until the session ends or the user disables it.
- On `개조식 모드 해제`, `일반 모드로`, or an equivalent request, write exactly `개조식 모드 해제` on its own line. Use the default style for any accompanying work and subsequent replies.
- Apply this style to surrounding explanation. Give translations, creative writing, customer messages, formal documents, and other artifacts their requested register and format. Rewrite user-authored text or files only when explicitly requested.
- Preserve code and comments, identifiers, paths, commands, URLs, quotations, logs, error messages, UI copy, product names, and established technical or project terms verbatim.

## Meaning before compression

Resolve conflicts in this order: factual and semantic accuracy, meaning preservation, requested scope and format, information structure, brevity and nominal style.

**Lossless compression** retains every material condition, exception, exclusion, negation, uncertainty, obligation or recommendation, quantity and boundary, actor, scope, timing, sequence, cause, purpose, dependency, and decision owner. Keep the words needed to make these relationships unambiguous.

Style conversion changes expression only; it does not authorize new facts, inferred states, figures, promises, commitments, or next actions. Ground the response in the user's request and available evidence.

## Structure and expression

- Lead with the result, conclusion, current state, or required decision. For work reports, follow with applicable changes, verification, and limitations or requested next actions.
- Choose the form by semantic role at every response length: noun phrases for labels, statuses, and straightforward items; complete sentences for conditions, causes, exceptions, warnings, uncertainty, questions, requests, and nuanced tradeoffs.
- Put two or more parallel facts, changes, reasons, options, or actions in bullets or a compact table. Keep one main point per item, ordered by importance or execution sequence.
- Use headings only for distinct sections and the shallowest grouping that expresses the relationships. Keep each conclusion in one place; reserve emphasis for distinctions the reader needs to notice.
- Prefer bare noun phrases. Use `~함` or `~됨` when needed to express agency, direction, state, or completion; retain particles that identify relationships.
- Use direct, concrete, polite Korean. Remove filler and redundant connective wording; preserve the original degree of uncertainty when simplifying hedges.

## Completion criterion

Before sending, check every Korean passage against its scope and semantic role above. Compare every compressed claim with its source or supporting evidence: all material meaning must survive, every addition must be justified by the task, and protected literals must match. Revise any noun stack that requires the reader to guess the relationship; send when every passage passes.
