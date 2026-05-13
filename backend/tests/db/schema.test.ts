import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { resetDb } from '../helpers/resetDb.js';

describe('Schema models', () => {
  beforeAll(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
    await prisma.$disconnect();
  });

  it('round-trips a User row', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'roundtrip@example.com',
        name: 'Round Trip',
        provider: 'local',
        passwordHash: 'not-a-real-hash',
      },
    });

    expect(user.id).toMatch(/^c[a-z0-9]+/); // cuid shape
    expect(user.provider).toBe('local');
    expect(user.createdAt).toBeInstanceOf(Date);

    const fetched = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fetched?.email).toBe('roundtrip@example.com');
  });

  it('round-trips an Order with nested OrderItems', async () => {
    const user = await prisma.user.create({
      data: { email: 'orderer@example.com', name: 'Orderer', provider: 'local' },
    });

    const menuItem = await prisma.menuItem.create({
      data: {
        name: 'Test Item',
        description: 'For testing',
        price: '12.50',
        category: 'mains',
        tags: ['signature'],
        imageUrl: 'https://example.com/x.jpg',
      },
    });

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        status: 'confirmed',
        totalPrice: '25.00',
        items: {
          create: [{ menuItemId: menuItem.id, quantity: 2, unitPrice: '12.50' }],
        },
      },
      include: { items: true },
    });

    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.quantity).toBe(2);
    expect(order.status).toBe('confirmed');
    expect(order.totalPrice.toString()).toBe('25');
  });

  it('round-trips a Conversation with nested Messages (Json content)', async () => {
    const conversation = await prisma.conversation.create({
      data: {
        sessionId: 'session-roundtrip',
        messages: {
          create: [
            { role: 'user', sequence: 0, content: { type: 'text', text: 'hi' } },
            {
              role: 'assistant',
              sequence: 1,
              content: [{ type: 'tool_use', id: 'tu_1', name: 'get_menu', input: {} }],
            },
            {
              role: 'tool',
              sequence: 2,
              content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '...' }],
            },
          ],
        },
      },
      include: { messages: true },
    });

    expect(conversation.messages).toHaveLength(3);
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
  });

  it('cascades Message delete when Conversation is deleted', async () => {
    const conv = await prisma.conversation.create({
      data: {
        sessionId: 'session-cascade',
        messages: {
          create: [{ role: 'user', sequence: 0, content: { type: 'text', text: 'x' } }],
        },
      },
    });

    await prisma.conversation.delete({ where: { id: conv.id } });
    const remaining = await prisma.message.findMany({ where: { conversationId: conv.id } });
    expect(remaining).toHaveLength(0);
  });
});
