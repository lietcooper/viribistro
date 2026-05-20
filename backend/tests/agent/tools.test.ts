import { describe, expect, it } from 'vitest';
import { toolSchemas, toolInputZod } from '../../src/services/agent/tools.js';

const expectedToolNames = [
  'add_to_cart',
  'remove_from_cart',
  'modify_item',
  'get_cart',
  'get_menu',
  'get_item_customizations',
  'clarify',
] as const;

describe('AI agent tool schemas', () => {
  it('exposes all seven tools in the Anthropic tools array', () => {
    expect(toolSchemas).toHaveLength(7);
    const names = toolSchemas.map((t) => t.name).sort();
    expect(names).toEqual([...expectedToolNames].sort());
  });

  it('every tool has a non-empty description and an input_schema object', () => {
    for (const tool of toolSchemas) {
      expect(typeof tool.description).toBe('string');
      expect((tool.description ?? '').length).toBeGreaterThan(10);
      expect(tool.input_schema).toBeDefined();
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('every tool declares a `required` array on its input_schema', () => {
    // Anthropic's JSON-schema validator expects `required` to be present,
    // even on zero-arg tools (e.g. get_cart with `required: []`).
    for (const tool of toolSchemas) {
      const schema = tool.input_schema as { required?: unknown };
      expect(Array.isArray(schema.required)).toBe(true);
    }
  });

  it('add_to_cart requires itemId, allows optional quantity (positive integer)', () => {
    const schema = toolSchemas.find((t) => t.name === 'add_to_cart')!;
    const required = (schema.input_schema as { required?: string[] }).required ?? [];
    expect(required).toEqual(['itemId']);

    const zod = toolInputZod.add_to_cart;
    expect(zod.safeParse({ itemId: 'abc' }).success).toBe(true);
    expect(zod.safeParse({ itemId: 'abc', quantity: 3 }).success).toBe(true);
    expect(
      zod.safeParse({
        itemId: 'abc',
        quantity: 3,
        customizations: { groupA: ['optionA'] },
      }).success,
    ).toBe(true);
    expect(zod.safeParse({ itemId: 'abc', quantity: 0 }).success).toBe(false);
    expect(zod.safeParse({ itemId: 'abc', quantity: 1.5 }).success).toBe(false);
    expect(zod.safeParse({ quantity: 1 }).success).toBe(false);
  });

  it('get_item_customizations requires itemId', () => {
    const schema = toolSchemas.find((t) => t.name === 'get_item_customizations')!;
    expect((schema.input_schema as { required?: string[] }).required).toEqual(['itemId']);
    const zod = toolInputZod.get_item_customizations;
    expect(zod.safeParse({ itemId: 'abc' }).success).toBe(true);
    expect(zod.safeParse({}).success).toBe(false);
  });

  it('remove_from_cart requires itemId', () => {
    const schema = toolSchemas.find((t) => t.name === 'remove_from_cart')!;
    expect((schema.input_schema as { required?: string[] }).required).toEqual(['itemId']);
    const zod = toolInputZod.remove_from_cart;
    expect(zod.safeParse({ itemId: 'abc' }).success).toBe(true);
    expect(zod.safeParse({}).success).toBe(false);
  });

  it('modify_item requires itemId and newQuantity (non-negative integer)', () => {
    const schema = toolSchemas.find((t) => t.name === 'modify_item')!;
    expect((schema.input_schema as { required?: string[] }).required).toEqual([
      'itemId',
      'newQuantity',
    ]);
    const zod = toolInputZod.modify_item;
    expect(zod.safeParse({ itemId: 'a', newQuantity: 0 }).success).toBe(true);
    expect(zod.safeParse({ itemId: 'a', newQuantity: 4 }).success).toBe(true);
    expect(zod.safeParse({ itemId: 'a', newQuantity: -1 }).success).toBe(false);
  });

  it('get_cart accepts no arguments', () => {
    const zod = toolInputZod.get_cart;
    expect(zod.safeParse({}).success).toBe(true);
  });

  it('get_menu accepts an optional category enum', () => {
    const zod = toolInputZod.get_menu;
    expect(zod.safeParse({}).success).toBe(true);
    expect(zod.safeParse({ category: 'mains' }).success).toBe(true);
    expect(zod.safeParse({ category: 'breakfast' }).success).toBe(false);
  });

  it('clarify requires a non-empty question string', () => {
    const zod = toolInputZod.clarify;
    expect(zod.safeParse({ question: 'Which burger?' }).success).toBe(true);
    expect(zod.safeParse({ question: '' }).success).toBe(false);
    expect(zod.safeParse({}).success).toBe(false);
  });
});
