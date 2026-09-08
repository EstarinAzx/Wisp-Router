// ------------- index.ts — @wisp/core public surface: the whole engine, flat ------------- //

/*
 * Depends on:
 *   - ./catalog, ./routing, ./routingCli, ./bridge, ./bridgeAnthropic, ./bridgeServer,
 *     ./modelsDev, ./codexClient, ./anthropicClient, ./xaiClient, ./antigravityClient,
 *     ./codexAuth, ./anthropicAuth, ./xaiAuth,
 *     ./kimiAuth,
 *     ./home, ./homeStore, ./slash — re-exported as one flat namespace.
 * Data shapes: none of its own — everything comes from the modules below.
 */

// Never published: each face (vscode, tui) resolves this barrel straight from TS source
// and bundles it at build time (ADR-0001).
export * from './catalog';
export * from './routing';
export * from './routingCli';
export * from './snapshotCli';
export * from './discoveryCli';
export * from './bridge';
export * from './bridgeAnthropic';
export * from './bridgeResponses';
export * from './bridgeServer';
export * from './modelsDev';
export * from './codexClient';
export * from './codexModels';
export * from './anthropicClient';
export * from './xaiClient';
export * from './antigravityClient';
export * from './codexAuth';
export * from './anthropicAuth';
export * from './xaiAuth';
export * from './kimiAuth';
export * from './antigravityAuth';
export * from './home';
export * from './homeStore';
export * from './status';
export * from './slash';
