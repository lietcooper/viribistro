// Anthropic client factory. The client itself is created lazily so test code
// that uses an injected FakeAnthropic never instantiates the real SDK and
// never needs ANTHROPIC_API_KEY to point at a real key.
//
// We expose a setter for tests / harness code to override the production
// instance — the chat route reads `getAnthropicClient()` so dependency
// injection happens at the edge.
import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicLike } from './loop.js';
import { env } from '../../lib/env.js';

let cached: AnthropicLike | undefined;

export function getAnthropicClient(): AnthropicLike {
  if (cached) return cached;
  cached = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cached;
}

/**
 * Override the cached client. Used by tests to inject a FakeAnthropic
 * before triggering a route via supertest. Pass `undefined` to reset.
 */
export function setAnthropicClient(client: AnthropicLike | undefined): void {
  cached = client;
}
