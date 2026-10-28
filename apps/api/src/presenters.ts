import type { Prisma } from '@shared-vps/database';
type PlanData = Prisma.PlanGetPayload<Record<string, never>>;
type SubData = Prisma.SubscriptionGetPayload<Record<string, never>> & { plan?: PlanData; credentials?: { demoIdentifier: string; revokedAt: Date | null }[] };
type OrderData = Prisma.OrderGetPayload<Record<string, never>> & { plan?: PlanData; payments?: { status: string }[]; subscription?: SubData | null };
export function publicPlan(p: PlanData) { return { id: p.id, code: p.code, name: p.name, price: p.price, currency: p.currency, durationDays: p.durationDays, isActive: p.isActive }; }
export function publicSubscription(s: SubData) { return { id: s.id, planId: s.planId, status: s.status, startedAt: s.startedAt, expiresAt: s.expiresAt, createdAt: s.createdAt,
  ...(s.plan ? { plan: publicPlan(s.plan) } : {}), credentials: s.status === 'ACTIVE' && s.expiresAt && s.expiresAt > new Date() ? (s.credentials ?? []).filter(c => !c.revokedAt).map(c => ({ demoIdentifier: c.demoIdentifier, revokedAt: null })) : [] };
}
export function publicOrder(o: OrderData) { return { id: o.id, status: o.status, amount: o.amount, currency: o.currency, periodDays: o.periodDays, createdAt: o.createdAt, lastError: o.lastError ? 'ACTIVATION_PENDING' : null,
  ...(o.plan ? { plan: publicPlan(o.plan) } : {}), ...(o.payments ? { payments: o.payments.map(p => ({ status: p.status })) } : {}), ...(o.subscription ? { subscription: publicSubscription(o.subscription) } : {}) };
}
