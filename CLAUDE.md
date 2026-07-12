# CLAUDE.md

*Universal template — the canonical copy lives at `~/.claude/template/IN USE/CLAUDE.md` (ecosystem-kb page: getclaude). Improve it there and refresh project copies with `getclaude -Force`; edits made only to a project copy get lost.*

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Ecosystem Knowledgebase

**`~/.claude/ecosystem-kb` is the map of the global Claude setup. Consult it instead of guessing.**

It is an /llm-kb wiki vault covering installed plugins, skills, config mechanics, and decision lineups (what was kept, what was deprecated, why). Use it when:

- Asked "what tooling/skills do we have" — answer from the vault, not memory.
- About to suggest or install a new skill/plugin — a decision page may already cover that niche with a chosen winner.
- Unsure which skill to route a task to — see `wiki/syntheses/ecosystem-overview.md` (entry point).

Query with `/llm-kb query <question>` or read the vault directly. If the ecosystem changes during a session (plugin added/removed, new lineup decision), update the matching wiki page + index + log in the same pass.

## 6. Session Handoff via .context/

**If `.context/` exists in this repo, it is the cross-session handoff state. Use it through the preset loop.**

- Session start: if `.context/pick-up.md` exists → run `/preset pick-up` (resumes the exact next task). `.context/` exists but no note → run `/preset catch-up`, then skim `.context/overview.md`.
- Session end, or before forking to a new line of work: run `/preset wrap-up` — it gates the finish, runs `/context-update`, and writes the pick-up note. Don't run bare `/context-update` as the session-close move; wrap-up wraps it.
- If the project has no `.context/` yet and work will span multiple sessions, suggest `/context-init` once — don't create it unasked.

## 7. Plain Language When Discussing

**Talk in plain English. Reach shared understanding, not a jargon dump.**

When explaining, grilling, planning, or walking through a design with the user
(not writing code or commits), use everyday words:

- Lead with the plain idea, then the term — not the term first.
- Define any unavoidable jargon in the same breath, or skip it.
- Prefer an analogy over a pile of nouns when a concept is new.
- One question / one idea at a time; confirm we're aligned before moving on.
- Acronyms, API names, and file:line detail come **last**, only when they earn
  their place — not as the opening move.

For `/trace` answers specifically: a handful of short numbered steps, one
analogy if it helps, file paths only at the end, close with a one-line rule of
thumb. Still do the full trace and persist file:line detail to
`.context/flows.md` — that's the record; offer the detailed
data-journey/failure/gaps breakdown only if asked.

The test: could someone who doesn't know the codebase follow it? If a sentence
needs a glossary to parse, rewrite it. Code, commits, and PRs stay precise/normal
— this governs how we *talk through* things.

## 8. JavaScript Style

**JavaScript: prefer arrow functions.**

Default to arrow functions (`const fn = () => {}`). Use a regular `function` only
when arrow semantics break the code:

- Methods/code needing their own `this` (object methods, class prototypes, event
  handlers relying on `this`).
- Functions needing `arguments`, `new.target`, or to be used as a constructor.
- Generators (`function*`) and named hoisted declarations where hoisting matters.

When in doubt, arrow. Switch to `function` only for the cases above.

