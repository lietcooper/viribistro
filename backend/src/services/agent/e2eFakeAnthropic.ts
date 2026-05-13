import type Anthropic from '@anthropic-ai/sdk';
import type { AnthropicLike } from './loop.js';

function textBlock(text: string): Anthropic.TextBlock {
  return { type: 'text', text, citations: null };
}

function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
  return { type: 'tool_use', id, name, input } as unknown as Anthropic.ToolUseBlock;
}

function message(
  params: Anthropic.MessageCreateParamsNonStreaming,
  content: Anthropic.ContentBlock[],
  stopReason: Anthropic.StopReason,
): Anthropic.Message {
  return {
    id: `e2e_msg_${Date.now()}`,
    role: 'assistant',
    type: 'message',
    model: params.model,
    stop_reason: stopReason,
    stop_details: null,
    stop_sequence: null,
    content,
    container: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      service_tier: null,
      server_tool_use: null,
    },
  };
}

function latestUserText(messages: Anthropic.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== 'user') continue;
    if (typeof msg.content === 'string') return msg.content;
  }
  return '';
}

function latestUserIsToolResult(messages: Anthropic.MessageParam[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== 'user') continue;
    return (
      Array.isArray(msg.content) && msg.content.some((block) => block.type === 'tool_result')
    );
  }
  return false;
}

function itemIdFromSystem(
  params: Anthropic.MessageCreateParamsNonStreaming,
  itemName: string,
): string | null {
  const system = Array.isArray(params.system) ? params.system : [];
  const text = system.map((block) => (block.type === 'text' ? block.text : '')).join('\n');
  const escaped = itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped} \\(id: ([^)]+)\\)`, 'i'));
  return match?.[1] ?? null;
}

export function createE2eFakeAnthropic(): AnthropicLike {
  return {
    messages: {
      async create(params) {
        if (latestUserIsToolResult(params.messages)) {
          return message(
            params,
            [
              textBlock(
                'Added a Wagyu Beef Burger to your cart. <SUGGEST>["What is in my cart?","Checkout"]</SUGGEST>',
              ),
            ],
            'end_turn',
          );
        }

        const input = latestUserText(params.messages).toLowerCase();
        if (input.includes('wine')) {
          return message(
            params,
            [
              toolUseBlock('e2e_clarify_wine', 'clarify', {
                question: 'Did you mean House Red Wine or House White Wine?',
              }),
            ],
            'tool_use',
          );
        }

        if (input.includes('cart')) {
          return message(
            params,
            [
              textBlock(
                'Your cart is ready for checkout. <SUGGEST>["Add dessert","Place my order"]</SUGGEST>',
              ),
            ],
            'end_turn',
          );
        }

        if (input.includes('burger') || input.includes('wagyu')) {
          const burgerId = itemIdFromSystem(params, 'Wagyu Beef Burger');
          if (burgerId) {
            return message(
              params,
              [
                toolUseBlock('e2e_add_burger', 'add_to_cart', {
                  itemId: burgerId,
                  quantity: 1,
                }),
              ],
              'tool_use',
            );
          }
        }

        return message(
          params,
          [
            textBlock(
              'I don\'t have a table booking system, but I can help you order food. Want me to recommend something? <SUGGEST>["What\'s on the menu?","Add the wagyu burger"]</SUGGEST>',
            ),
          ],
          'end_turn',
        );
      },
    },
  };
}
