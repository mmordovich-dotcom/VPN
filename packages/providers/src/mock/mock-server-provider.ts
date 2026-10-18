import { randomUUID } from 'node:crypto';
import { ServerNotFoundError } from '../interfaces/server-provider.js';
import type { ServerConfig, ServerInfo, ServerProvider } from '../interfaces/server-provider.js';
export class MockServerProvider implements ServerProvider {
  private readonly servers = new Map<string, ServerInfo>();
  async createServer(config: ServerConfig): Promise<ServerInfo> {
    if (!config.name.trim() || !Number.isSafeInteger(config.capacity) || config.capacity < 1) throw new Error('Invalid mock server configuration');
    const server: ServerInfo = { id: `mock-${randomUUID()}`, name: config.name.trim(), capacity: config.capacity, provider: 'MOCK', status: 'ACTIVE', createdAt: new Date().toISOString() };
    this.servers.set(server.id, server);
    return { ...server };
  }
  async getServer(id: string): Promise<ServerInfo> {
    const server = this.servers.get(id);
    if (!server) throw new ServerNotFoundError();
    return { ...server };
  }
  async terminateServer(id: string): Promise<void> {
    const server = await this.getServer(id);
    this.servers.set(id, { ...server, status: 'TERMINATED' });
  }
}
