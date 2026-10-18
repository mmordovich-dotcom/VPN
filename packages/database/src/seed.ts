import type { PrismaClient } from '@prisma/client';
import { DEMO_PLAN } from '@shared-vps/shared';
export async function seedDatabase(db: PrismaClient) {
  return db.$transaction(async tx => {
    const plan = await tx.plan.upsert({ where: { code: DEMO_PLAN.code }, create: { ...DEMO_PLAN }, update: {} });
    const settings = [
      { key: 'server.monthly_cost_minor', valueType: 'INTEGER' as const, value: 20000 },
      { key: 'server.rental_days', valueType: 'INTEGER' as const, value: 30 },
      { key: 'server.default_capacity', valueType: 'INTEGER' as const, value: 3 },
      { key: 'business.first_purchase_reserve_minor', valueType: 'INTEGER' as const, value: 3000 },
      { key: 'business.currency', valueType: 'STRING' as const, value: 'RUB' },
    ];
    for (const setting of settings) await tx.setting.upsert({ where: { key: setting.key }, create: setting, update: {} });
    return plan;
  });
}
