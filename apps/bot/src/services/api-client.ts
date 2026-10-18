import type { HealthInfo } from '@shared-vps/shared';
export class ApiClient {
  constructor(private readonly baseUrl: string) {}
  async health(): Promise<HealthInfo> {
    const response = await fetch(new URL('/health', this.baseUrl), { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Backend unavailable');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('status' in result) || result.status !== 'ok') throw new Error('Invalid backend response');
    return result as HealthInfo;
  }
}
