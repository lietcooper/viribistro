// The agent tool-calling loop.
//
// One call to `runAgentLoop` represents one user turn. Inside the loop we
// keep calling Anthropic's messages.create() as long as the model returns a
// `tool_use` stop_reason; each tool is dispatched via services/agent/tools.ts
// and the result is appended to the messages array before the next call.
//
// Termination:
//   - stop_reason 'end_turn'   → return the final assistant text
//   - stop_reason 'refusal'    → return a graceful fallback (the model
//                                declined; we do not retry)
//   - clarify tool_use         → short-circuit immediately with the model's
//                                question as the reply (CLAUDE.md line 100)
//   - MAX_LOOP_ITERATIONS hit  → return a graceful "got stuck" reply
//
// Dependency injection: the caller passes the Anthropic client (or a stub).
// This is why production code wires `getAnthropicClient()` from anthropic.ts
// at the route layer rather than importing the SDK here directly — keeps
// the loop unit-testable without mocking modules.
import type Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../lib/logger.js';
import { dispatchTool, toolSchemas, type DispatchResult, type ToolName } from './tools.js';
import {
  buildStaticSystemPrompt,
  renderCartBlock,
  type MenuSnapshotItem,
} from './systemPrompt.js';
import { getCart, type Cart } from '../cart.js';

export const MAX_LOOP_ITERATIONS = 6;

// We use a structural type rather than `Anthropic` itself so unit tests can
// pass in a stub that only implements messages.create.
export interface AnthropicLike {
  messages: {
    create(
      params: Anthropic.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Message>;
  };
}

export interface RunAgentLoopArgs {
  anthropic: AnthropicLike;
  sessionId: string;
  menu: MenuSnapshotItem[];
  // History from earlier turns of the same conversation, as already-shaped
  // Anthropic message params (we persist Message.content as JSON, so this
  // is a 1:1 mapping from the DB).
  priorMessages: Anthropic.MessageParam[];
  userMessage: string;
  model: string;
  // Optional knobs.
  maxTokens?: number;
}

/**
 * Per-tool record surfaced on the response envelope. The shape matches
 * the frontend's `ChatToolUsed` type so the wire contract is honest.
 * `input` is whatever the model passed to the tool (already-parsed JSON
 * from the Anthropic SDK — we don't pre-validate before recording so
 * downstream UI can show exactly what the model attempted, even on
 * validation failures).
 */
export interface ToolUsedRecord {
  name: ToolName;
  input: unknown;
}

export interface RunAgentLoopResult {
  reply: string;
  toolsUsed: ToolUsedRecord[];
  cartUpdate: Cart | null;
  /**
   * The message turn(s) that should be appended to the conversation table.
   * Order: the user message, every assistant turn (with tool_use blocks),
   * every interleaved tool_result user turn, and the final assistant text.
   * Excludes the system prompt (which is never persisted).
   */
  newTurnMessages: Anthropic.MessageParam[];
}

const GRACEFUL_STUCK_REPLY =
  "Sorry, I got stuck — could you try rephrasing?";

const GRACEFUL_REFUSAL_REPLY =
  "I can't help with that one. Want me to recommend something from the menu instead?";

/**
 * Pull a final text reply out of an assistant message. Concatenates every
 * `text` content block with newlines and trims.
 */
function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function runAgentLoop(args: RunAgentLoopArgs): Promise<RunAgentLoopResult> {
  const {
    anthropic,
    sessionId,
    menu,
    priorMessages,
    userMessage,
    model,
    maxTokens = 1024,
  } = args;

  const cart = getCart(sessionId);

  // The system array is split in two so the static half (persona + menu)
  // stays byte-stable across requests in the same chat — Anthropic returns
  // a cache hit on it. The volatile cart block is appended as a separate
  // text block WITHOUT cache_control so cart mutations don't bust the
  // prefix cache (CLAUDE.md design / docs/plans/ai-agent.md step 14).
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: buildStaticSystemPrompt(menu),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: renderCartBlock(cart),
    },
  ];

  // Running message log we send to the API on each turn. We MUTATE this list
  // as the loop unfolds, and return everything past the prior-history mark
  // as `newTurnMessages` to the caller for persistence.
  const messages: Anthropic.MessageParam[] = [
    ...priorMessages,
    { role: 'user', content: userMessage },
  ];
  const priorCount = priorMessages.length;

  const toolsUsed: ToolUsedRecord[] = [];
  let mutated = false;
  let iteration = 0;

  let response: Anthropic.Message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    tools: toolSchemas,
  });

  // Loop while the model wants more tool calls AND we have iterations left.
  while (response.stop_reason === 'tool_use') {
    if (iteration >= MAX_LOOP_ITERATIONS) {
      logger.warn(
        { sessionId, iterations: iteration, toolsUsed },
        'Agent loop hit MAX_LOOP_ITERATIONS — returning graceful fallback',
      );
      return {
        reply: GRACEFUL_STUCK_REPLY,
        toolsUsed,
        cartUpdate: null,
        newTurnMessages: messages.slice(priorCount),
      };
    }
    iteration++;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    // Append the full assistant message to the running log so the next API
    // call sees it (Anthropic requires the prior assistant turn that
    // initiated the tool_use before the matching tool_result).
    messages.push({ role: 'assistant', content: response.content });

    // Execute tools sequentially (open-questions: see ai-agent.md). Mutating
    // the same in-memory cart Map in parallel would race; sequential keeps
    // the per-turn semantics deterministic.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let clarifyQuestion: string | null = null;
    for (const tu of toolUseBlocks) {
      const dispatched: DispatchResult = await dispatchTool(
        { id: tu.id, name: tu.name, input: tu.input },
        { sessionId },
      );

      toolsUsed.push({ name: dispatched.toolName, input: tu.input });

      if (dispatched.type === 'clarify') {
        // Don't return immediately — we still need a matching tool_result for
        // EVERY tool_use block in this assistant turn so the persisted history
        // is well-formed. Otherwise replaying it on the next turn causes
        // Anthropic to reject the request (unmatched tool_use).
        clarifyQuestion = dispatched.question;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify({ clarify: dispatched.question }),
        });
        continue;
      }

      if (dispatched.mutated) {
        mutated = true;
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: dispatched.tool_use_id,
        content: dispatched.content,
        ...(dispatched.is_error ? { is_error: true } : {}),
      });
    }

    // Feed the results back as a single user message containing every
    // tool_result block (matches Anthropic's expected protocol).
    messages.push({ role: 'user', content: toolResults });

    if (clarifyQuestion !== null) {
      // Short-circuit: the clarify question IS the reply for this turn.
      // The persisted turn now includes BOTH the assistant message with the
      // clarify tool_use block AND a synthetic tool_result, so the next
      // call's history replays as a valid Anthropic message sequence.
      return {
        reply: clarifyQuestion,
        toolsUsed,
        cartUpdate: mutated ? getCart(sessionId) : null,
        newTurnMessages: messages.slice(priorCount),
      };
    }

    response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      tools: toolSchemas,
    });
  }

  // The final assistant message also needs to land in newTurnMessages so the
  // route can persist it.
  messages.push({ role: 'assistant', content: response.content });

  let reply: string;
  if (response.stop_reason === 'refusal') {
    logger.info({ sessionId }, 'Agent loop received refusal stop_reason');
    reply = GRACEFUL_REFUSAL_REPLY;
  } else if (response.stop_reason === 'max_tokens') {
    // Reply is truncated — keep what we got but warn.
    logger.warn(
      { sessionId },
      'Agent loop response was truncated by max_tokens — surfacing partial reply',
    );
    reply = extractText(response) || GRACEFUL_STUCK_REPLY;
  } else {
    // end_turn (or stop_sequence — same handling).
    reply = extractText(response);
  }

  return {
    reply,
    toolsUsed,
    cartUpdate: mutated ? getCart(sessionId) : null,
    newTurnMessages: messages.slice(priorCount),
  };
}
