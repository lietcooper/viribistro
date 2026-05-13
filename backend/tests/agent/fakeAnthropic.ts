// FakeAnthropic — a tiny stand-in for the Anthropic client used by the agent
// loop in unit tests. Tests queue scripted responses via `enqueue(...)` and
// the loop consumes them through `client.messages.create(...)`. Each call
// records its full params so tests can assert prompt caching, system block
// shape, history threading, etc.
import type Anthropic from '@anthropic-ai/sdk';

export interface FakeAnthropicMessage {
  id?: string;
  role?: 'assistant';
  type?: 'message';
  model?: string;
  stop_reason: Anthropic.StopReason;
  stop_sequence?: string | null;
  content: Anthropic.ContentBlock[];
  usage?: Partial<Anthropic.Usage>;
  container?: null;
}

export interface FakeMessagesAPI {
  create(params: Anthropic.MessageCreateParams): Promise<Anthropic.Message>;
}

export interface FakeAnthropic {
  messages: FakeMessagesAPI;
  /** Add a scripted response to the queue (FIFO). */
  enqueue(msg: FakeAnthropicMessage): void;
  /** All params passed to messages.create() in order. */
  calls: Anthropic.MessageCreateParams[];
}

export function createFakeAnthropic(): FakeAnthropic {
  const queue: FakeAnthropicMessage[] = [];
  const calls: Anthropic.MessageCreateParams[] = [];

  return {
    calls,
    enqueue(msg) {
      queue.push(msg);
    },
    messages: {
      async create(params) {
        // Snapshot the messages + system arrays so later mutations by the
        // loop don't retroactively change what tests see.
        const snapshot: Anthropic.MessageCreateParams = {
          ...params,
          messages: [...(params.messages ?? [])],
          ...(params.system !== undefined ? { system: params.system } : {}),
        };
        calls.push(snapshot);
        const next = queue.shift();
        if (!next) {
          throw new Error(
            `FakeAnthropic: messages.create() called ${calls.length} time(s) but only ${
              calls.length - 1
            } responses were enqueued`,
          );
        }
        const full: Anthropic.Message = {
          id: next.id ?? `msg_${calls.length}`,
          role: 'assistant',
          type: 'message',
          model: params.model,
          stop_reason: next.stop_reason,
          stop_sequence: next.stop_sequence ?? null,
          content: next.content,
          container: null,
          usage: {
            input_tokens: next.usage?.input_tokens ?? 0,
            output_tokens: next.usage?.output_tokens ?? 0,
            cache_creation_input_tokens: next.usage?.cache_creation_input_tokens ?? null,
            cache_read_input_tokens: next.usage?.cache_read_input_tokens ?? null,
            cache_creation: null,
            inference_geo: null,
            service_tier: null,
            server_tool_use: null,
          },
        };
        return full;
      },
    },
  };
}

// Convenience builders for clean tests.
export function textBlock(text: string): Anthropic.TextBlock {
  return { type: 'text', text, citations: null };
}

export function toolUseBlock(
  id: string,
  name: string,
  input: unknown,
): Anthropic.ToolUseBlock {
  return { type: 'tool_use', id, name, input };
}
