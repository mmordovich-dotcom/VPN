import type { Prisma } from '@shared-vps/database';
import { enqueue } from './job-queue.js';
type Tx = Prisma.TransactionClient;
type Subscription = { id: string; userId: string; expiresAt: Date | null; status: string };
export async function scheduleReminders(tx: Tx, sub: Subscription) {
  if (sub.status !== 'ACTIVE' || !sub.expiresAt) return;
  for (const days of [3, 1]) await enqueue(tx, 'NOTIFY', `reminder:${days}:${sub.id}:${sub.expiresAt.getTime()}`, {
    event: days === 3 ? 'REMINDER_3' : 'REMINDER_1', userId: sub.userId, subscriptionId: sub.id, expectedExpiry: sub.expiresAt.toISOString(),
  }, new Date(sub.expiresAt.getTime() - days * 86400000));
}
export async function notifySubscription(tx: Tx, event: 'EXPIRED' | 'RENEWED', sub: Subscription, key: string) {
  await enqueue(tx, 'NOTIFY', `${event.toLowerCase()}:${key}`, { event, userId: sub.userId, subscriptionId: sub.id, expectedExpiry: sub.expiresAt?.toISOString() ?? null });
}
export async function notifyOrder(tx: Tx, order: { id: string; userId: string; status: string }) {
  await enqueue(tx, 'NOTIFY', `order:${order.id}:${order.status}`, { event: 'ORDER', userId: order.userId, orderId: order.id, expectedStatus: order.status });
}
