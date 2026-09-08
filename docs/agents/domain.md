# Domain documentation

This monorepo has one shared domain glossary: root `CONTEXT.md`. Read it before exploring domain behavior, then read relevant decisions in `docs/adr/` and the project `.context/` indexes.

Use the glossary's names for Provider, Active Provider, Bridge, Routing map, Alias, Family route, Target, and launcher. A Codex Provider is an upstream backend; codex-wisp is a launcher for a client of the Bridge.

Keep glossary entries limited to term meanings. Implementation choices belong in tickets or decisions. Flag conflicts with an existing decision rather than silently replacing it. Create additional context files only when a distinct domain requires them.
