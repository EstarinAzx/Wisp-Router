import '../../scripts/span-sandbox';
import { mock } from 'bun:test';
const actual = await import('@opentui/react/test-utils');
const render = actual.testRender;
mock.module('@opentui/react/test-utils', () => ({ ...actual, testRender: async (...args: Parameters<typeof actual.testRender>) => {
  const setup = await render(...args);
  setup.captureSpans = () => { throw new Error('intentional span capture failure'); };
  return setup;
} }));
