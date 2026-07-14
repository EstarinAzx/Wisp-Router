// ------------- index.ts — @wisp/core public surface: the whole engine, flat ------------- //

/*
 * Depends on:
 *   - ./catalog, ./routing, ./bridge, ./bridgeAnthropic, ./bridgeServer,
 *     ./modelsDev, ./codexClient, ./anthropicClient, ./codexAuth, ./anthropicAuth,
 *     ./home, ./homeStore, ./slash — re-exported as one flat namespace.
 * Data shapes: none of its own — everything comes from the modules below.
 */

// Never published: each face (vscode, tui) resolves this barrel straight from TS source
// and bundles it at build time (ADR-0001).
export * from './catalog';
export * from './routing';
export * from './bridge';
export * from './bridgeAnthropic';
export * from './bridgeServer';
export * from './modelsDev';
export * from './codexClient';
export * from './anthropicClient';
export * from './codexAuth';
export * from './anthropicAuth';
export * from './home';
export * from './homeStore';
export * from './slash';
