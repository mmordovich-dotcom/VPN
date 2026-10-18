export interface ServerConfig { name: string; capacity: number }
export interface ServerInfo { id: string; name: string; capacity: number; status: 'ACTIVE' | 'TERMINATED'; provider: 'MOCK'; createdAt: string }
export interface ServerProvider {
  createServer(config: ServerConfig): Promise<ServerInfo>;
  getServer(id: string): Promise<ServerInfo>;
  terminateServer(id: string): Promise<void>;
}
export class ServerNotFoundError extends Error {
  constructor() { super('Mock server not found'); this.name = 'ServerNotFoundError'; }
}
