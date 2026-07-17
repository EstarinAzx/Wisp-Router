// ---------------- infoScreens.tsx — the info Screens: /bridge facts + /help list + /show-log tail ---------------- //

/*
 * Depends on:
 *   - react: useState/useEffect — LogScreen re-renders per pushed line while open (#122).
 *   - @wisp/core: SLASH_COMMANDS — /help renders FROM the shared registry (#82).
 *   - ./theme: ACCENT/DIM/PANEL/SELECT_COLORS — the shared look.
 *   - ./widgets: wrapWords — hand-wrapped panel copy.
 *   - ./logBuffer: RingLog — the Bridge log the Log Screen tails (#122).
 *
 * Data shapes:
 *   - BridgeScreen + HelpScreen are pure: BridgeScreen renders the 'bridge' Mode payload
 *     (address + secret frozen at bind time — ensureBridgeSecret's disk write must not live
 *     in JSX), HelpScreen takes only its close callback. LogScreen subscribes to the ring.
 *     The shell keeps the /bridge starter and Esc routing.
 *
 * Extracted from app.tsx with #119.
 */

import { useEffect, useState } from 'react';
import { SLASH_COMMANDS } from '@wisp/core';
import { ACCENT, DIM, PANEL, SELECT_COLORS } from './theme';
import { wrapWords, SELECT_MOUSE } from './widgets';
import type { RingLog } from './logBuffer';

// ----------------------------------------- /bridge ----------------------------------------- //

// The Bridge info panel — connection facts for the session's own listener.
export const BridgeScreen = ({ address, secret, cols }: { address: string; secret: string; cols: number }) => (
  <box {...PANEL} title="Bridge" marginTop={1} padding={1} flexDirection="column">
    {/* status header first — state + port at a glance, then the connection facts (#80).
        Always "up" by construction: this mode is only entered post-bind, and no stop path
        exists without leaving the screen. Port derives from the frozen address so the header
        can't contradict the copy-paste lines below after an external config edit.
        Layout rule: every row is single-purpose with wrapMode none — a wrapped row made
        opentui overlay every row after it on narrow terminals (the old chaos); clipping
        beats garbage. The settings.json snippet block was cut for the same reason — its
        75-col rows were the widest offender; claude-wisp is the one shipped connect path,
        and the VS Code side panel still renders the full snippet (core builder untouched). */}
    <text wrapMode="none"><span fg="#4ade80">● up</span><span fg={DIM}> · port {address.slice(address.lastIndexOf(':') + 1)}</span></text>

    <box marginTop={1} flexDirection="column">
      <text wrapMode="none"><span fg={DIM}>{'OpenAI door'.padEnd(16)}</span><span fg={ACCENT}>{address}/v1</span></text>
      <text wrapMode="none"><span fg={DIM}>{'Anthropic door'.padEnd(16)}</span><span fg={ACCENT}>{address}</span></text>
      <text wrapMode="none"><span fg={DIM}>{'Access secret'.padEnd(16)}</span><span fg={ACCENT}>{secret}</span></text>
    </box>

    <box marginTop={1} flexDirection="column">
      <text wrapMode="none"><span fg={DIM}>{'Claude Code'.padEnd(16)}</span>claude-wisp [args…]</text>
      <text wrapMode="none" fg={DIM}>{''.padEnd(16)}launches claude wired to this Bridge</text>
    </box>

    {/* Advisor is endpoint-gated upstream — its calls never hit the configurable base URL,
        so the Bridge can't intercept them and no fix exists on our side. Warn here, where
        Claude Code gets wired. Hand-wrapped (panel rows never use opentui wrap); -2 = the
        panel's inner padding. Plain-text amber, no glyph — ⚠ is ambiguous-width and smears
        on common Windows fonts, same reason the select indicator is off. */}
    <box marginTop={1} flexDirection="column">
      {wrapWords("Heads up: Claude Code's Advisor won't work through Wisp even when bound to Claude OAuth — it's endpoint-gated upstream. Use native claude for advisor tasks.", cols - 2)
        .map((l, i) => <text key={i} wrapMode="none" flexShrink={0} fg="#fbbf24">{l}</text>)}
    </box>

    <text wrapMode="none" fg={DIM} marginTop={1}>Esc closes — listener stays up · /bridge off stops · /quit kills</text>
  </box>
);

// ----------------------------------------- /show-log ----------------------------------------- //

// The Bridge log tail (#122) — scrollbox stickyScroll gives auto-follow with scroll-to-pause
// and a mouse-draggable native scrollbar; no SELECT_MOUSE needed (that's the <select> shim).
export const LogScreen = ({ log, running }: { log: RingLog; running: boolean }) => {
  // subscribe → tick: one re-render per pushed line while the Screen is open
  const [, setTick] = useState(0);
  useEffect(() => log.subscribe(() => setTick((t) => t + 1)), [log]);
  const lines = log.lines();
  return (
    <box {...PANEL} title="Bridge log" marginTop={1} padding={1} flexDirection="column">
      <text wrapMode="none" flexShrink={0}>
        {running ? <span fg="#4ade80">● bridge up</span> : <span fg={DIM}>○ bridge not running — /bridge starts it</span>}
      </text>
      <scrollbox height={16} marginTop={1} stickyScroll stickyStart="bottom" scrollY>
        {lines.length === 0
          ? <text wrapMode="none" fg={DIM}>{running ? 'No traffic yet.' : 'Nothing logged yet.'}</text>
          : lines.map((l, i) => <text key={i} wrapMode="none" fg={DIM}>{l}</text>)}
      </scrollbox>
      <text wrapMode="none" fg={DIM} marginTop={1}>Esc closes — scroll up pauses follow, bottom resumes · buffer keeps collecting</text>
    </box>
  );
};

// ----------------------------------------- /help ----------------------------------------- //

// The /help panel — the command list, closed by Enter or Esc (the shell routes Esc).
export const HelpScreen = ({ onDone }: { onDone: () => void }) => (
  <box {...PANEL} title="Commands" marginTop={1} flexDirection="column">
    {/* rendered FROM the shared registry (#82) — the palette's autocomplete and this list
        can never disagree. A select, not plain rows: 13+ commands clip a 24-row terminal,
        and the select brings the same height cap + scroll the other pickers use. Enter
        only closes — firing (or toggling!) a command from a help list would surprise. */}
    <select
      focused
      {...SELECT_COLORS}
      {...SELECT_MOUSE}
      height={Math.min(SLASH_COMMANDS.length * 2, 12)}
      showSelectionIndicator={false}
      showScrollIndicator
      options={SLASH_COMMANDS.map((c) => ({ name: `/${c.name}${c.args ? ` ${c.args}` : ''}`, description: c.description, value: c.name }))}
      onSelect={() => onDone()}
    />
    <text wrapMode="none" fg={DIM} marginTop={1}>Enter or Esc closes.</text>
  </box>
);
