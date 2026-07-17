// ---------------- routingScreens.tsx — the /routing flow: overview, sections, alias naming, row picks ---------------- //

/*
 * Depends on:
 *   - @wisp/core: PROVIDERS + FAMILY_KEYS + the pure routing-map read/edit helpers.
 *   - ./store: the shared ~/.wisp handle — the routing map lives in config.
 *   - ./modes: RouteRow — which map row a picker chain is editing.
 *   - ./theme: PANEL/DIM/SELECT_COLORS — the shared look.
 *   - ./widgets: wrapWords + WrapSelect + onSubmitText — the wrapped-select Screens.
 *
 * Data shapes:
 *   - Screens are pure functions of their Mode payload fields + navigation callbacks — same
 *     rules as providerScreens (#117): no Screen owns navigation or shell state. The shell
 *     keeps the route action starters (applyRoute/clearRow/startRouteModel/bindClaudeFamilies)
 *     and Esc step-back routing, importing the row helpers it needs from here.
 *
 * Extracted from app.tsx with #118: the eight routing-flow Screens plus the routing-row
 * helpers only this flow uses (routingMap, rowLabel, sectionOf, CLAUDE_FAMILY_MODELS are
 * shared with the shell's starters).
 */

import {
  PROVIDERS, FAMILY_KEYS, EMPTY_ROUTING_MAP, withAliasRenamed,
  type Provider, type RoutingMap, type FamilyKey, type Target,
} from '@wisp/core';
import { home } from './store';
import type { RouteRow } from './modes';
import { PANEL, DIM, SELECT_COLORS } from './theme';
import { wrapWords, WrapSelect, onSubmitText } from './widgets';

// ----------------------------------------- Row helpers ----------------------------------------- //

export const routingMap = (): RoutingMap => home.readConfig().routing ?? EMPTY_ROUTING_MAP;

export const rowLabel = (row: RouteRow): string => (row.kind === 'family' ? row.family : row.name);

// Border-title-safe label: opentui silently drops a whole title over one non-ASCII char, and alias
// names are free text (the panel accepts anything) — replace the offenders, never lose the title.
const titleLabel = (row: RouteRow): string => rowLabel(row).replace(/[^\x20-\x7e]/g, '?');

const rowTarget = (map: RoutingMap, row: RouteRow): Target | undefined =>
  row.kind === 'family' ? map.families[row.family] : map.aliases.find((a) => a.name === row.name)?.target;

// The /routing sub-screens step back one level on Esc/apply — to the SECTION they came from
// (#79). Origin is derivable (family rows → Claude Code section, alias screens → Custom).
export const sectionOf = (row: RouteRow): 'families' | 'aliases' => row.kind === 'family' ? 'families' : 'aliases';

// The one-tap "bind Claude subscription models" mapping: each Family route's natural Claude.ai
// model. TUI-local data — promote to core if the side panel ever grows the same button.
export const CLAUDE_FAMILY_MODELS: Record<FamilyKey, string> = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5',
  fable: 'claude-fable-5',
};

// ----------------------------------------- Screens ----------------------------------------- //

// The /routing overview — two sections: Claude Code's Family routes, and the named Aliases.
export const RoutingScreen = ({ cols, onPick }: {
  cols: number;
  onPick: (section: 'families' | 'aliases') => void;
}) => (
  <box {...PANEL} title="Routing map" marginTop={1} flexDirection="column">
    {/* hand-wrapped into per-line rows — opentui's own wrap garbles everything below it */}
    {wrapWords("Points incoming model names at your Providers — Claude Code's claude-* ids via Family routes, your own names via Aliases.", cols)
      .map((l, i) => <text key={i} wrapMode="none" flexShrink={0} fg={DIM}>{l}</text>)}
    <WrapSelect
      cols={cols}
      maxRows={12}
      options={[
        { name: 'Claude Code', description: `the Family routes (${FAMILY_KEYS.join(' / ')})`, value: 'families' },
        { name: 'Custom', description: `your named Aliases (${routingMap().aliases.length}) + add`, value: 'aliases' },
      ]}
      onSelect={(_i, opt) => onPick(opt.value as 'families' | 'aliases')}
    />
  </box>
);

// One section's rows — Family routes with the one-tap bind, or Aliases with add.
export const RoutingSectionScreen = ({ section, cols, onAddAlias, onBind, onPickRow }: {
  section: 'families' | 'aliases';
  cols: number;
  onAddAlias: () => void;
  onBind: () => void;
  onPickRow: (row: RouteRow) => void;
}) => (
  <box {...PANEL} title={section === 'families' ? 'Routing — Claude Code' : 'Routing — Custom'} marginTop={1} flexDirection="column">
    {/* value encodes the row as kind:key — split at the FIRST colon, alias names may contain more */}
    {/* keyed by section so toggling families ↔ aliases can't reuse a stale selection */}
    <WrapSelect
      key={section}
      cols={cols}
      maxRows={14}
      options={section === 'families'
        ? [
            ...FAMILY_KEYS.map((f) => {
              const t = routingMap().families[f];
              return { name: f, description: t ? `${t.providerId} (${t.model})` : 'not routed — Active Provider answers', value: `family:${f}` };
            }),
            // ' bind' rides the same leading-space convention as ' clear'/' rename' — it can
            // never collide with a family:/alias: row key.
            { name: 'Bind Claude subscription models', description: 'route all four families to Anthropic (Claude.ai) in one go', value: ' bind' },
          ]
        : [
            ...routingMap().aliases.map((a) => ({ name: a.name, description: `alias — ${a.target.providerId} (${a.target.model})`, value: `alias:${a.name}` })),
            { name: 'Add alias', description: 'name a new bridged model', value: 'add' },
          ]}
      onSelect={(_i, opt) => {
        const v = opt.value;
        if (v === 'add') { onAddAlias(); return; }
        if (v === ' bind') { onBind(); return; }
        const key = v.slice(v.indexOf(':') + 1);
        onPickRow(v.startsWith('family:') ? { kind: 'family', family: key as FamilyKey } : { kind: 'alias', name: key });
      }}
    />
  </box>
);

// Name a new alias — precheck the Provider-id shadow rule while the name is still editable.
export const AliasNameScreen = ({ onBack, onStatus, onNamed }: {
  onBack: (message: string) => void;
  onStatus: (message: string) => void;
  onNamed: (name: string) => void;
}) => (
  <box {...PANEL} title="New alias name" marginTop={1}>
    <input
      focused
      placeholder="a bridged model name, e.g. fast"
      onSubmit={onSubmitText((value) => {
        const name = value.trim();
        if (!name) { onBack('Empty — no alias added.'); return; }
        // Precheck the shadow rule here so the collision message lands while the name is
        // still editable (core's withAlias refuses it again at persist time).
        if (PROVIDERS.some((p) => p.id === name)) { onStatus(`"${name}" is a Provider id — pick another name.`); return; }
        onNamed(name);
      })}
    />
  </box>
);

// Rename an existing alias in place — Target kept, only the bridged name changes.
export const AliasRenameScreen = ({ name, onBack, onStatus }: {
  name: string;
  onBack: (message: string) => void;
  onStatus: (message: string) => void;
}) => (
  <box {...PANEL} title={`Rename alias ${titleLabel({ kind: 'alias', name })}`} marginTop={1}>
    <input
      focused
      placeholder={name}
      onSubmit={onSubmitText((value) => {
        const next = value.trim();
        if (!next || next === name) { onBack('Unchanged.'); return; }
        // Split the two refusals so the message names the actual collision; input stays editable.
        if (PROVIDERS.some((p) => p.id === next)) { onStatus(`"${next}" is a Provider id — pick another name.`); return; }
        const renamed = withAliasRenamed(routingMap(), PROVIDERS, name, next);
        if (!renamed) { onStatus(`"${next}" is already an alias — pick another name.`); return; }
        home.writeConfig({ routing: renamed });
        onBack(`Alias ${name} → ${next}.`);
      })}
    />
  </box>
);

// Pick a row's Provider — alias rows lead with the rename/remove verbs.
export const RouteProviderScreen = ({ row, cols, onClear, onRename, onPick }: {
  row: RouteRow;
  cols: number;
  onClear: () => void;
  onRename: (name: string) => void;
  onPick: (p: Provider) => void;
}) => (
  <box {...PANEL} title={`Route ${titleLabel(row)} via...`} marginTop={1} flexDirection="column">
    <WrapSelect
      cols={cols}
      maxRows={14}
      options={[
        // Alias rows lead with the edit verbs (#79) — no scrolling past every Provider to
        // rename. Only for aliases already IN the map: the add-alias flow passes through here
        // before its row is persisted, and rename/remove on a nonexistent alias dead-ends.
        // Leading-space values can't collide with Provider ids (ids never start with a space).
        ...(row.kind === 'alias' && routingMap().aliases.some((a) => a.name === (row as { name: string }).name)
          ? [
              { name: 'Rename alias', description: 'keep the Target, change the bridged name', value: ' rename' },
              { name: 'Remove alias', description: 'delete this bridged name', value: ' clear' },
            ]
          : []),
        ...PROVIDERS.map((p) => ({ name: p.label, description: p.id, value: p.id })),
        // A Family route is cleared, never renamed — its picker keeps clear at the bottom.
        ...(row.kind === 'family'
          ? [{ name: 'Clear route', description: 'family falls back to the Active Provider', value: ' clear' }]
          : []),
      ]}
      onSelect={(_i, opt) => {
        if (opt.value === ' clear') { onClear(); return; }
        if (opt.value === ' rename' && row.kind === 'alias') { onRename(row.name); return; }
        const p = PROVIDERS.find((x) => x.id === opt.value);
        if (p) onPick(p);
      }}
    />
  </box>
);

// The route-model fetch's parking line — the shell starter resolves it to pick or free entry.
export const RouteModelLoadingScreen = ({ provider }: { provider: Provider }) => (
  <text wrapMode="none" flexShrink={0} fg={DIM} marginTop={1}>Fetching models for {provider.label}…</text>
);

// Pick the row's pinned model from the Provider's curated/live list.
export const RouteModelPickScreen = ({ row, provider, options, onApply }: {
  row: RouteRow;
  provider: Provider;
  options: string[];
  onApply: (target: Target) => void;
}) => (
  <box {...PANEL} title={`Model for ${titleLabel(row)} - ${provider.label}`} marginTop={1} flexDirection="column">
    {/* "(current)" only when the row already targets THIS provider — two providers can list the same id */}
    <select
      focused
      {...SELECT_COLORS}
      height={Math.min(options.length, 14)}
      showDescription={false}
      showSelectionIndicator={false}
      showScrollIndicator
      options={options.map((id) => {
        const t = rowTarget(routingMap(), row);
        return {
          name: t?.providerId === provider.id && t.model === id ? `${id} (current)` : id,
          description: '',
          value: id,
        };
      })}
      onSelect={(_i, opt) => {
        if (opt) onApply({ providerId: provider.id, model: String(opt.value) });
      }}
    />
  </box>
);

// No live list — free-typed model id for the row; empty keeps the old route.
export const RouteModelFreeScreen = ({ row, provider, onApply, onEmpty }: {
  row: RouteRow;
  provider: Provider;
  onApply: (target: Target) => void;
  onEmpty: () => void;
}) => (
  <box {...PANEL} title={`Model for ${titleLabel(row)} - ${provider.label} (no live list - type an id)`} marginTop={1}>
    <input
      focused
      placeholder={provider.defaultModel || 'model id'}
      onSubmit={onSubmitText((value) => {
        const id = value.trim();
        if (id) onApply({ providerId: provider.id, model: id });
        else onEmpty();
      })}
    />
  </box>
);
