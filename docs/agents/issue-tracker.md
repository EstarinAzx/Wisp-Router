# Issue tracker: GitHub

Specs and tickets live in `EstarinAzx/Wisp-Router` GitHub issues. Use the authenticated `gh` CLI and infer the repository from the checkout's origin.

- Read the full issue and comments before acting: `gh issue view <number> --comments`.
- Use `--body-file` for multiline issue, PR, and comment text.
- Publish specs and implementation slices with `ready-for-agent`; select only unblocked implementation slices in the assigned scope, not their parent spec.
- Use native sub-issue and blocking relationships when available, plus readable `Parent` and `Blocked by` sections. Native dependency creation takes the blocker's database ID, not its issue number.
- Resume an existing owned branch/PR; never duplicate it. A collision with somebody else's work requires a handoff.
- The local test/typecheck/review gate is authoritative; this repository's release workflow runs on tags rather than ordinary PRs.
- PRs as a request surface: no.

The preset ticket loop owns implementation and breadcrumbs. Project context commits belong on main and exclude unrelated user edits.
