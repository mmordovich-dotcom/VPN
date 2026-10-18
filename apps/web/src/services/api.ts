import type { PublicPlan } from '@shared-vps/shared';
const base = __API_BASE_URL__;
export async function getHealth(): Promise<void> {
  const response = await fetch(new URL('/health', base), { signal: AbortSignal.timeout(5000) });
  const body: unknown = await response.json();
  if (!response.ok || !body || typeof body !== 'object' || !('status' in body) || body.status !== 'ok') throw new Error('Backend unavailable');
}
export async function getPlans(): Promise<PublicPlan[]> {
  const response = await fetch(new URL('/api/v1/plans', base), { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Catalog unavailable');
  const body: unknown = await response.json();
  if (!Array.isArray(body) || !body.every(plan => typeof plan === 'object' && plan !== null && typeof plan.code === 'string' && typeof plan.name === 'string' && Number.isSafeInteger(plan.price) && plan.price >= 0 && /^[A-Z]{3}$/.test(plan.currency) && Number.isInteger(plan.durationDays) && plan.durationDays > 0 && Number.isInteger(plan.maxUsersPerServer) && plan.maxUsersPerServer > 0)) throw new Error('Invalid catalog response');
  return body as PublicPlan[];
}
