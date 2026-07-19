// ---------------- theme.ts — the TUI's canonical look: splash art, colors, panel + select styling ---------------- //

/*
 * Depends on: nothing — pure constants, importable by the shell and every Screen module.
 * Data shapes: none of its own.
 *
 * Extracted from app.tsx with #116 so the select-transparency landmine has ONE home: any new
 * native <select> must spread SELECT_COLORS or it reverts to the opaque default.
 */

// ----------------------------------------- Splash ----------------------------------------- //

// Hand-rolled ASCII art instead of <ascii-font>: deterministic across font packs, zero API risk.
// The trailing low block is a cursor-style underscore — the wordmark reads "Wisp_".
export const SPLASH = [
  '██╗    ██╗██╗███████╗██████╗ ',
  '██║    ██║██║██╔════╝██╔══██╗',
  '██║ █╗ ██║██║███████╗██████╔╝',
  '██║███╗██║██║╚════██║██╔═══╝ ',
  '╚███╔███╔╝██║███████║██║     ██████╗',
  ' ╚══╝╚══╝ ╚═╝╚══════╝╚═╝     ╚═════╝',
].join('\n');

// ----------------------------------------- Colors + panel ----------------------------------------- //

export const ACCENT = '#a78bfa';
export const DIM = '#71717a';
// /show-log: [bridge] route … lines (model swaps) — pop against DIM traffic.
export const LOG_ROUTE = '#38bdf8';
// /bridge panel: wisp-slot plugin recommend blurb.
export const PLUGIN_NUDGE = '#D59D24';

// One shared frame spread into every panel box — rounded dim border + accent title, so the
// whole TUI reads as one system instead of per-screen defaults. flexShrink 0 because a short
// terminal makes yoga shrink rows to zero height while opentui still paints them — rows overlap
// into garbage; refusing to shrink means content clips cleanly at the bottom edge instead.
export const PANEL = { border: true, borderStyle: 'rounded', borderColor: '#52525b', titleColor: ACCENT, flexShrink: 0 } as const;

// Native selects default to an opaque #1a1a1a fill when focused (plus #334455/yellow selection) —
// an opaque slab in a terminal with a background image. Spread into every <select> so they match
// the transparent hand-rolled WrapSelect rows: only the selected row gets a bar.
export const SELECT_COLORS = {
  backgroundColor: 'transparent',
  focusedBackgroundColor: 'transparent',
  selectedBackgroundColor: '#27272a',
  selectedTextColor: ACCENT,
  descriptionColor: DIM,
  selectedDescriptionColor: DIM,
} as const;
