// ---------------- clipboard.ts — copy selected TUI text to the system clipboard ---------------- //

/*
 * Depends on:
 *   - child_process (node): Windows clip.exe fallback when OSC 52 is unsupported.
 *   - @opentui/core: CliRenderer — OSC 52 path + capability probe.
 *
 * Data shapes: none.
 *
 * opentui highlights on drag but does not auto-copy. Prefer OSC 52 (works over SSH and in
 * modern terminals); on Windows hosts that reject it, fall back to clip.exe via stdin.
 */

import { spawn } from 'child_process';
import type { CliRenderer } from '@opentui/core';

// Copy plain text. Returns true when a write was attempted successfully.
export const copyText = (renderer: CliRenderer, text: string): boolean => {
  if (!text) return false;
  if (renderer.isOsc52Supported() && renderer.copyToClipboardOSC52(text)) return true;
  if (process.platform === 'win32') return copyViaClip(text);
  return false;
};

// clip.exe reads the clipboard payload from stdin. Fire-and-forget — selection must stay snappy.
const copyViaClip = (text: string): boolean => {
  try {
    const child = spawn('clip', [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    child.on('error', () => {});
    child.stdin.end(text, 'utf8');
    return true;
  } catch {
    return false;
  }
};
