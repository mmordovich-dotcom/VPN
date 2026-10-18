export interface HealthInfo { status: 'ok'; service: 'shared-vps-api'; stage: '1.1' }
export interface SystemInfo {
  name: string;
  stage: string;
  mode: 'demo';
  components: { api: 'available'; database: 'check-ready'; web: 'foundation'; bot: 'optional'; worker: 'foundation'; serverProvider: 'mock' };
}
export interface PublicPlan { code: string; name: string; price: number; currency: string; durationDays: number; maxUsersPerServer: number }
