// ---------------- modes.ts — the Mode union: every Screen's payload type, shared without the shell ---------------- //

/*
 * Depends on:
 *   - @wisp/core: Provider (picker payloads) + FamilyKey (routing-row identity).
 *
 * Data shapes:
 *   - Mode: the screen state machine — see the union below; owned and driven by the shell.
 *   - RouteRow: which Routing-map row is being edited — a fixed Family or a named Alias.
 *
 * Extracted from app.tsx with #116 so Screen modules can type their payloads without a
 * circular import on the shell.
 */

import type { Provider, FamilyKey } from '@wisp/core';

// ----------------------------------------- Route rows ----------------------------------------- //

// Which Routing-map row a picker chain is editing — a fixed Family or a named Alias (#65).
export type RouteRow = { kind: 'family'; family: FamilyKey } | { kind: 'alias'; name: string };

// ----------------------------------------- Mode union ----------------------------------------- //

export type Mode =
  | { kind: 'input' }
  | { kind: 'providers' }
  // origin 'menu' on the two reused screens below: entered from the provider menu, so save/cancel
  // returns into the /providers flow instead of the palette (#106).
  | { kind: 'provider-menu'; provider: Provider }
  | { kind: 'key-pick' }
  | { kind: 'key-entry'; provider: Provider; origin?: 'menu' }
  | { kind: 'model-loading'; provider: Provider }
  | { kind: 'model-pick'; provider: Provider; options: string[] }
  | { kind: 'model-free'; provider: Provider }
  | { kind: 'oauth-pick'; action: 'signin' | 'signout' }
  | { kind: 'signin-wait'; provider: Provider; origin?: 'menu' }
  | { kind: 'effort-pick' }
  | { kind: 'test'; provider: Provider; model: string; text: string; phase: 'streaming' | 'done' | 'error'; error?: string }
  // Address + secret ride in the mode so the screen render stays pure (ensureBridgeSecret hits disk
  // and can write auth.json — a side effect that must not live in JSX).
  | { kind: 'bridge'; address: string; secret: string }
  | { kind: 'help' }
  // Payload-less: the Log Screen reads the shell-owned ring buffer live (#122).
  | { kind: 'log' }
  // The /routing chain (#65, sectioned #79): overview (two sections) → section rows → name a new
  // alias / pick a row's Provider → pick its model. 'alias-rename' edits an existing alias's NAME
  // in place (Target kept) — reached from the row's Provider picker. The families section also
  // carries the one-tap "Bind Claude subscription models" row (sign in first if needed).
  | { kind: 'routing' }
  | { kind: 'routing-section'; section: 'families' | 'aliases' }
  | { kind: 'alias-name' }
  | { kind: 'alias-rename'; name: string }
  | { kind: 'route-provider'; row: RouteRow }
  | { kind: 'route-model-loading'; row: RouteRow; provider: Provider }
  | { kind: 'route-model-pick'; row: RouteRow; provider: Provider; options: string[] }
  | { kind: 'route-model-free'; row: RouteRow; provider: Provider };
