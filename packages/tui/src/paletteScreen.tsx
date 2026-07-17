// ---------------- paletteScreen.tsx — the palette: command input + live slash suggestion rows ---------------- //

/*
 * Depends on:
 *   - @opentui/core: InputRenderable — the ref type the shell clears the input through.
 *   - @wisp/core: SlashCommandDef — the suggestion rows' shape.
 *   - ./theme: ACCENT/DIM/PANEL — the shared look.
 *   - ./widgets: wrapWords + onSubmitText — clipped-row wrapping and the submit adapter.
 *
 * Data shapes:
 *   - PaletteScreen is a pure function of the live suggestion list + highlight index. The shell
 *     owns the line/selIdx state (its global keyboard handler steers the highlight) and the
 *     Enter semantics (submitLine) — this Screen only renders and forwards input events.
 *
 * Extracted from app.tsx with #119.
 */

import type { RefObject } from 'react';
import type { InputRenderable } from '@opentui/core';
import type { SlashCommandDef } from '@wisp/core';
import { ACCENT, DIM, PANEL } from './theme';
import { wrapWords, onSubmitText } from './widgets';

// ----------------------------------------- Screen ----------------------------------------- //

// The default screen: the command input plus the suggestion list under it.
export const PaletteScreen = ({ inputRef, cols, suggestions, highlight, onInput, onSubmit }: {
  inputRef: RefObject<InputRenderable | null>;
  cols: number;
  suggestions: SlashCommandDef[];
  highlight: number;
  onInput: (value: string) => void;
  onSubmit: (raw: string) => void;
}) => (
  <>
    {/* no border title — the wordmark above already brands the box; inner padding = chunkier bar */}
    <box {...PANEL} marginTop={1} padding={1}>
      <input
        ref={inputRef}
        placeholder="Type / for commands"
        focused
        onInput={onInput}
        onSubmit={onSubmitText(onSubmit)}
      />
    </box>
    <box flexDirection="column" marginTop={1}>
      {suggestions.flatMap((c, i) => {
        const on = i === highlight;
        const bg = on ? '#27272a' : undefined;
        const head = `/${c.name}${c.args ? ` ${c.args}` : ''}`;
        // A row that fits stays one line; a clipped one splits into a command line plus
        // hand-wrapped dim description lines (same rule as WrapSelect — opentui's own wrap
        // garbles every row below it). 2 = the highlight prefix, 3 = ' — '.
        if (2 + head.length + 3 + c.description.length <= cols) {
          return [
            <text key={c.name} wrapMode="none" flexShrink={0} bg={bg}>
              {on ? <span fg={ACCENT}>{'> '}</span> : '  '}
              <span fg={ACCENT}>/{c.name}</span>{c.args ? ` ${c.args}` : ''} <span fg={DIM}>— {c.description}</span>
            </text>,
          ];
        }
        return [
          <text key={c.name} wrapMode="none" flexShrink={0} bg={bg}>
            {on ? <span fg={ACCENT}>{'> '}</span> : '  '}
            <span fg={ACCENT}>/{c.name}</span>{c.args ? ` ${c.args}` : ''}
          </text>,
          ...wrapWords(c.description, Math.max(cols - 4, 10)).map((l, j) => (
            <text key={`${c.name}:${j}`} wrapMode="none" flexShrink={0} bg={bg} fg={DIM}>{`    ${l}`}</text>
          )),
        ];
      })}
    </box>
  </>
);
