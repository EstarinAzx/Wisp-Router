# Session logs and VS Code Copilot compatibility

Engineering design selected under khitarashi's 2026-11-12 autonomy approval. The user requested the behavior below; storage and compatibility choices are coordinator decisions, not claims of separate design approval.

## Intent and behavior

Keep `wisp serve` running in its own terminal with a startup/lifecycle banner. Inspect chat traffic separately: `wisp logs` lists sessions and their stable copyable IDs; `wisp log <id>` reads one, with `-f` for following. TUI `/show logs` presents the same list and opens one session. Preserve `/show-log` as an alias. Bare `wisp log` should give the list/usage rather than silently merging unrelated chats.

Sessions must remain distinct when two requests interleave, including two conversations using the same model. Native VS Code, terminal-hosted Bridge and extension-hosted Bridge use one core log format in the same Wisp home. Log readers do not start/reconfigure a Bridge. Host lifecycle lines belong in a clearly labeled host stream, never in an arbitrary chat's stream.

VS Code acceptance includes the actual Copilot SDK/Agent Host harness in the supplied screenshots, plus existing classic/native and Local behavior. First reproduce both Antigravity errors; correct their demonstrated causes without weakening authenticated history, tool IDs, cancellation, complete-response validation or permission boundaries. All advertised supported text/chat model families should use the shared path; image generation remains outside scope.

## Approaches and selected implementation

Use a small shared filesystem telemetry store in core. The existing terminal-only file cannot identify sessions or serve VS Code; a new daemon/HTTP log service would add lifecycle, auth and port coupling without benefit. Keep renderer-free readers and existing native polling/select widgets.

Use already-validated request identities: Claude metadata session UUID, Responses session header and native VS Code `_conversationId`. Namespace by surface and hash for filenames/public IDs; never use raw external strings as paths. Unknown identity gets an explicit uncorrelated request entry, never a fake shared session. Keep attribution through asynchronous request work (stdlib AsyncLocalStorage is an option; choose after inspecting all log callers). Record source, provider/model, timestamps, request outcome and safe diagnostics; omit prompts, responses, tool arguments/results, credentials and encrypted replay payloads.

Activity must be honest: Wisp observes requests, not whether every remote client's chat tab remains open. The list labels last activity and in-flight/idle state; the documented active/recent window is 30 minutes since last request, including in-flight calls. Stale stored sessions remain readable by ID but are excluded from the default active list. Do not claim process liveness from a stale log timestamp. A real close signal may retire a session sooner when available; adding a client-management subsystem is unnecessary.

Bound telemetry: maximum 128 retained sessions and 256 KiB per session file plus at most one rotation. Use owner-only creation permissions where supported, best-effort writes, atomic metadata or append records that tolerate partial tails, and bounded reads. Preserve another process's stream during rotation and pruning; avoid mutable shared indexes if files can carry their own metadata. Concurrent writers to the same conversation need a safe design or per-host stream namespace with clear display labels. Logging failure must not fail a chat. Document limits and test them.

## Touch points

Core log store and exports; Bridge request boundaries and existing validated identity parsers; terminal Bridge/serve/log CLI/entrypoint; TUI slash registry, modes, navigation, list/detail screen; native VS Code chat logging and extension-hosted Bridge; focused core/TUI/native tests; README/changelogs/release preparation. Compatibility fixes may touch the native Antigravity adapter/shared validator only after a reproducing test identifies the mismatch.

## Constraints and risks

Primary checkout only, no worktrees; reuse Bun/TypeScript/React/OpenTUI and stdlib. Preserve existing credentials/settings and running clients. Use isolated WISP_HOME and development profiles for testing. Required CodeRabbit checkpoints precede integration. No publication/tagging in this scope. Next version is 2.2.11 because 2.2.10 is already released.

Real Copilot host translation can drop/change history parts; synthetic adapter tests do not prove it. Upstream Claude/Gemini response shapes may differ. Those remain investigation questions, not permission to invent opaque tool IDs or bypass replay checks. If platform access makes full acceptance impossible, retain evidence and report the exact gap while completing independent work.
