import { RELEASE } from '../release.js';
export const PROJECT_NAME = 'Shared VPS Platform';
export const STAGE = RELEASE.stage;
export const DEMO_PLAN = { code: 'basic', name: 'Basic', price: 17000, currency: 'RUB', durationDays: 30, maxUsersPerServer: 3 } as const;
