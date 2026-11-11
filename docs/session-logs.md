# Chat session logs

Keep the Bridge running with `wisp serve`. Its terminal shows connection details and lifecycle messages; request diagnostics are inspected separately:

```sh
wisp logs
wisp log <session-id>
wisp log <session-id> --follow
```

`-f` also follows. Bare `wisp log` lists sessions. Invalid or unavailable IDs exit with an error instead of showing another conversation. Recent host lifecycle streams are listed separately and can be opened by their own IDs.

Inside the TUI, `/show logs` opens the same session list. Select a row and press Enter to follow its latest 200 diagnostic events. The CLI reads all retained events. Esc returns to the list; Esc again closes it. `/show-log` remains an alias. Reading logs never starts a Bridge or changes configuration, and a fresh TUI sees sessions from terminal and VS Code hosts sharing the same Wisp home.

## Identity and activity

Messages uses the validated Claude session UUID, Responses uses its validated `session_id` header, and native VS Code chat uses its conversation ID. IDs are hashed with the protocol and host-instance identity before storage. Two hosts handling the same external conversation have separate streams; restarting a host creates new IDs. Requests without a usable identity are explicitly labeled **uncorrelated request**, each with a separate ID. Wisp does not infer identity from model names, cache keys, prompts or accounts.

The default list shows activity within 30 minutes. **In flight** means Wisp observed an unfinished request and a heartbeat within 90 seconds; it does not mean a chat tab is open. Active requests refresh their heartbeat every 30 seconds. After a crash, the in-flight indicator expires and the session eventually leaves the recent list. An older retained session remains readable by its exact ID.

## Privacy, limits and failures

Files live in `~/.wisp/sessions` (`WISP_HOME` overrides the home). Each JSON-lines record contains only the public ID, source/protocol, correlation flag, timestamp, sequence, in-flight count, event, and validated provider/model/status/attempt fields. Events cover request start, routing, retry, completion, failure, cancellation and heartbeat. Host start/stop records have their own stream. Prompts, replies, tool inputs/results, account/device metadata, raw error strings, credentials and replay packets are not persisted. Free-form internal diagnostic callbacks are not copied into these files.

Retention is capped at 128 streams, including host streams. Each stream has at most 256 KiB plus one rotated generation. Old idle streams are pruned first; live streams are protected. If all slots are busy, new telemetry may be dropped. File permissions are owner-only where supported; Windows uses the home directory's ACLs.

Writes are best-effort: contention, an unavailable directory or exhausted storage never fails a chat. A short filesystem lock serializes writes and pruning; a provably dead process's lock is reclaimed, while an unknown/live owner is left alone. Interrupted partial records and invalid entries are ignored; readers bound their allocations and reject path-like IDs. The follower uses sequence numbers across rotation. It cannot recover entries already discarded by retention or missed while the store was unavailable.

Legacy `bridge.log` and `bridge.log.1` are preserved on disk but are no longer appended, rotated or displayed by these commands. The new store deliberately does not import their arbitrary text. The access secret remains in the local Bridge startup banner, so keep that terminal private.
