---
name: to-html
description: Use when the user asks to organize, summarize, lay out, or save content as an HTML file/document, or wants content rendered as a standalone shareable page/report — phrases like "html로 정리", "html로 뽑아/만들어/저장", "정리해서 html로", "시각화해서 저장". NOT for app UI code or React/components inside a project.
disable-model-invocation: true
---

# Visualizing as HTML

## Overview
Turn arbitrary content (notes, meeting summaries, analyses, proposals, FGI reports) into a **single self-contained `.html` file** styled by a chosen brand design system bundled in `designs/`.

Two things are decided every time:
1. **Which brand design** — one of **60+ brand design systems** in `designs/` (catalog: `designs/INDEX.md`).
2. **How much motion/interaction** — minimal & static by default; richer only when the content earns it.

**Core principle: the user wants to read the content, not the decoration.** Design serves legibility first. Add interaction/animation only when it makes the content clearer or the user asked for it.

## Workflow
1. Confirm what content goes in and that they want an HTML file. If the content is ambiguous, ask what to include — never invent content.
2. **Pick the design** (see *Design Selection*). Skim `designs/INDEX.md`; honor any brand the user named, otherwise infer from the content's domain and desired feel.
3. **Read the chosen DESIGN.md fully** — `designs/<slug>.DESIGN.md` (exact filename is in INDEX.md), next to this SKILL.md. Follow its tokens, components, voice, and Motion & Easing section. Do not design from memory; the file is the source of truth.
4. **Decide richness** (see *Minimal vs Rich*). Default = clean & static.
5. Build ONE self-contained HTML file: inline `<style>`, system or CDN fonts only, no build step — it must work by double-clicking. Keep the source content's language (Korean stays Korean).
6. **Save to the current working directory** with a descriptive filename + `.html`.
7. **Open it** — launch the saved file in the default browser with `open` (see *Showing the result*). Then tell the user the path and state which design + richness level you chose (one line), so they can redirect.

## Design Selection
**60+ brand design systems** live in `designs/` (full list with category + accent + one-liner in `designs/INDEX.md`). Pick one per request:

1. **Explicit request wins.** If the user names a brand ("Toss 스타일로", "Linear처럼", "apple로"), use that file directly.
2. **Otherwise infer** from the content's domain + desired feel. Skim INDEX.md and match by category:

| Content / vibe | Good-fit categories & examples (slug) |
|---|---|
| Dense data, dashboards, reports, admin, B2B, 회의·FGI·CS 정리 | `developer-tools` / `backend-devops` / `productivity` — Ant Design (`alipay`), IBM Carbon (`ibm`), Vercel Geist (`vercel`), Linear (`linear.app`), MongoDB (`mongodb`), Sanity (`sanity`) |
| Narrative / showcase / pitch / vision / 발표·제안 | `consumer-tech` / design-tools — Apple HIG (`apple`), Airbnb (`airbnb`), Framer (`framer`), Figma (`figma`) |
| Money / trust / 금융·핀테크 | `fintech` — Toss (`toss`), Alipay (`alipay`), banksalad (`banksalad`), kakaobank (`kakaobank`), kakaopay (`kakaopay`), wise (`wise`) |
| AI product / model / 연구 | `ai` — Cursor (`cursor`), ElevenLabs (`elevenlabs`), Mistral (`mistral.ai`), Cohere (`cohere`), Upstage (`upstage`) |
| Commerce / 쇼핑·커머스 | `ecommerce` / consumer — Coupang (`coupang`), Gmarket (`gmarket`), zigzag (`zigzag`), Karrot (`karrot`) |
| Korean public / 정부·공공 | `government` — KRDS (`krds`) |

3. **Default when unclear:** Apple (`apple`) for narrative/showcase, Ant Design (`alipay`) for dense documents — the safe, legible baselines.

**Depth caveat:** some entries are full UI systems (tokens + components — e.g. `apple`, `alipay`, `ibm`, `vercel`, `mongodb`, `sanity`), others are brand-asset kits (logo + palette + voice, lighter on component specs — e.g. `cohere`, `elevenlabs`, `mistral.ai`). For laying out a document prefer a full UI system; reach for a brand-asset kit when the user wants that brand's *identity* (color/logo/voice) more than its components.

## Minimal vs Rich (motion / interaction)
**Default: minimal & static.** Clean layout, no JS, at most subtle CSS hover/transition allowed by the DESIGN.md Motion section.

Escalate to interaction/animation ONLY when at least one is true:
- The user explicitly asks ("인터랙티브", "애니메이션", "동적으로", "발표용").
- The content genuinely benefits — e.g.:
  - Long document → sticky table of contents, smooth-scroll, collapsible sections.
  - Many items, steps, or a timeline → scroll-reveal / progressive disclosure.
  - Tabular or comparison data → sortable/filterable table or tabs.
  - Showcase content (e.g. `apple`, `framer`) → tasteful scroll-driven section reveals.

Keep it tasteful and on-brand: follow the chosen DESIGN.md **Motion & Easing** (Ant = calm ~0.2–0.3s `cubic-bezier(0.645,0.045,0.355,1)`, never bouncy; Apple = slow, confident, pause-heavy). When in doubt, less.

### Red flags — STOP, you're over-decorating
- Adding animation to a one-page summary the user just wants to scan.
- JS that doesn't change comprehension.
- Motion that fights the brand's calm.

All of these mean: strip it back to static.

## Showing the result
After saving, always open the file in the default browser with the OS `open` command:
```bash
open "<absolute path>.html"
```
Just `open` — don't branch on chrome-devtools / agent-browser. The saved `.html` is the deliverable; if `open` errors, report the path and move on.

## Output requirements
- One file, fully self-contained (inline CSS; JS only if richness genuinely calls for it).
- Responsive and readable; semantic HTML.
- Faithful to the DESIGN.md tokens — colors, type scale, border-radius, spacing, shadows. No invented hexes or off-brand fonts.
- Preserve the source meaning and language; summarize/structure, don't fabricate.
- **Credit the design.** Record which brand design system was used, in two places:
  1. A discreet, on-brand **footer line** at the bottom of the page — e.g. *"Apple 디자인 시스템 기반"*, *"Styled with the Toss design system"* — in the brand's muted/secondary text tone so it never competes with the content.
  2. An **HTML comment at the very top** for traceability: `<!-- design: <slug> · designs/<slug>.DESIGN.md · generated by to-html -->`.

## Catalog source & adding a brand
The 61 files come from **oh-my-design.kr/design-systems** (`omd` format; mirror of github.com/kwakseongjae/oh-my-design → `design-md/<slug>/DESIGN.md`). The repo carries ~170 brands total, so more can be pulled in.
To add one: copy its `DESIGN.md` into `designs/` as `<slug>.DESIGN.md`, then regenerate `designs/INDEX.md` (parse each file's frontmatter: `name`, `category`, `primary_color`, `ds.name`/`ds.description`). No SKILL.md change needed unless you want a new example row in *Design Selection*.
