#!/usr/bin/env bun
// ------------------- index.tsx — wisp TUI entry: boot the renderer, mount the app ------------------- //
/*
 * Depends on:
 *   - @opentui/core: createCliRenderer — the native (Zig) terminal renderer.
 *   - @opentui/react: createRoot — mounts React onto the renderer.
 *   - ./app: the whole TUI.
 * Data shapes: none.
 */
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from './app';

const renderer = await createCliRenderer();
createRoot(renderer).render(<App />);
