import { z } from 'zod';

import { IntegrationDefinition } from './types.js';
import { IIntegrationRegistry } from './interfaces.js';
import { createModuleLogger } from '../utils/logger.js';

export class IntegrationRegistry implements IIntegrationRegistry {
  private integrations: Map<string, IntegrationDefinition> = new Map();
  private integrationsByModule: Map<string, Map<string, IntegrationDefinition>> = new Map();
  private integrationsByType: Map<string, Set<string>> = new Map();
  private connections: Map<string, IntegrationConnection> = new Map();
  private logger = createModuleLogger('integration-registry');

  register(moduleName: string, integration: IntegrationDefinition): void {
    const integrationName = `${moduleName}:${integration.name}`;

    if (this.integrations.has(integrationName)) {
      throw new Error(`Integration '${integrationName}' is already registered`);
    }

    this.integrations.set(integrationName, integration);

    if (!this.integrationsByModule.has(moduleName)) {
      this.integrationsByModule.set(moduleName, new Map());
    }
    this.integrationsByModule.get(moduleName)!.set(integration.name, integration);

    if (!this.integrationsByType.has(integration.type)) {
      this.integrationsByType.set(integration.type, new Set());
    }
    this.integrationsByType.get(integration.type)!.add(integrationName);
  }

  unregister(moduleName: string, integrationName: string): void {
    const fullIntegrationName = `${moduleName}:${integrationName}`;
    const integration = this.integrations.get(fullIntegrationName);

    if (!integration) return;

    // Disconnect if connected
    if (this.connections.has(fullIntegrationName)) {
      this.disconnect(fullIntegrationName).catch(error => this.logger.error('Failed to disconnect integration', { error, integrationName: fullIntegrationName }));
    }

    this.integrations.delete(fullIntegrationName);
    this.integrationsByModule.get(moduleName)?.delete(integrationName);
    this.integrationsByType.get(integration.type)?.delete(fullIntegrationName);

    if (this.integrationsByModule.get(moduleName)?.size === 0) {
      this.integrationsByModule.delete(moduleName);
    }

    if (this.integrationsByType.get(integration.type)?.size === 0) {
      this.integrationsByType.delete(integration.type);
    }
  }

  unregisterAll(moduleName: string): void {
    const moduleIntegrations = this.integrationsByModule.get(moduleName);
    if (!moduleIntegrations) return;

    for (const integrationName of moduleIntegrations.keys()) {
      this.unregister(moduleName, integrationName);
    }
  }

  get(integrationName: string): IntegrationDefinition | undefined {
    // Support both full and short names
    if (this.integrations.has(integrationName)) {
      return this.integrations.get(integrationName);
    }

    // Try to find by short name
    for (const [fullName, integration] of this.integrations.entries()) {
      if (fullName.endsWith(`:${integrationName}`)) {
        return integration;
      }
    }

    return undefined;
  }

  getByType(type: string): IntegrationDefinition[] {
    const integrationNames = this.integrationsByType.get(type);
    if (!integrationNames) return [];

    const integrations: IntegrationDefinition[] = [];
    for (const name of integrationNames) {
      const integration = this.integrations.get(name);
      if (integration) {
        integrations.push(integration);
      }
    }

    return integrations;
  }

  getByModule(moduleName: string): Map<string, IntegrationDefinition> {
    return this.integrationsByModule.get(moduleName) || new Map();
  }

  getAll(): Map<string, IntegrationDefinition> {
    return new Map(this.integrations);
  }

  async connect(integrationName: string, config: any): Promise<any> {
    const integration = this.get(integrationName);
    if (!integration) {
      throw new Error(`Integration '${integrationName}' not found`);
    }

    // Check if already connected
    const existingConnection = this.connections.get(integrationName);
    if (existingConnection && existingConnection.status === 'connected') {
      return existingConnection.connection;
    }

    // Validate connection config
    if (integration.connectionSchema) {
      try {
        config = integration.connectionSchema['parse'](config);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid connection config: ${error.message}`);
        }
        throw error;
      }
    }

    // Create connection
    const connection: IntegrationConnection = {
      integrationName,
      status: 'connecting',
      config,
      connectedAt: Date.now(),
      lastHealthCheck: 0,
      connection: null,
      error: null,
    };

    this.connections.set(integrationName, connection);

    try {
      const conn = await integration.connect(config);
      connection.connection = conn;
      connection.status = 'connected';

      // Perform initial health check
      if (integration.healthCheck) {
        try {
          const healthy = await integration.healthCheck();
          connection.lastHealthCheck = Date.now();
          if (!healthy) {
            this.logger.warn(`Integration '${integrationName}' connected but health check failed`);
          }
        } catch (error) {
          this.logger.error(`Health check failed for integration '${integrationName}'`, { error });
        }
      }

      return conn;
    } catch (error) {
      connection.status = 'error';
      connection.error = error as Error;
      throw error;
    }
  }

  async disconnect(integrationName: string): Promise<void> {
    const integration = this.get(integrationName);
    const connection = this.connections.get(integrationName);

    if (!connection) {
      return; // Not connected
    }

    try {
      if (integration?.disconnect && connection.connection) {
        await integration.disconnect();
      }
    } finally {
      this.connections.delete(integrationName);
    }
  }

  getConnection(integrationName: string): any {
    const connection = this.connections.get(integrationName);
    if (!connection || connection.status !== 'connected') {
      return null;
    }

    return connection.connection;
  }

  async healthCheck(integrationName: string): Promise<boolean> {
    const integration = this.get(integrationName);
    const connection = this.connections.get(integrationName);

    if (!integration || !connection || connection.status !== 'connected') {
      return false;
    }

    if (!integration.healthCheck) {
      return true; // Assume healthy if no health check provided
    }

    try {
      const healthy = await integration.healthCheck();
      connection.lastHealthCheck = Date.now();
      return healthy;
    } catch (error) {
      this.logger.error(`Health check failed for integration '${integrationName}'`, { error });
      return false;
    }
  }

  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, connection] of this.connections.entries()) {
      if (connection.status === 'connected') {
        const healthy = await this.healthCheck(name);
        results.set(name, healthy);
      } else {
        results.set(name, false);
      }
    }

    return results;
  }

  getConnectionStatus(integrationName: string): ConnectionStatus | null {
    const connection = this.connections.get(integrationName);
    if (!connection) return null;

    return {
      status: connection.status,
      connectedAt: connection.connectedAt,
      lastHealthCheck: connection.lastHealthCheck,
      error: connection.error?.message,
    };
  }

  getAllConnectionStatuses(): Map<string, ConnectionStatus> {
    const statuses = new Map<string, ConnectionStatus>();

    for (const [name, connection] of this.connections.entries()) {
      statuses.set(name, {
        status: connection.status,
        connectedAt: connection.connectedAt,
        lastHealthCheck: connection.lastHealthCheck,
        error: connection.error?.message,
      });
    }

    return statuses;
  }

  getTypes(): string[] {
    return Array.from(this.integrationsByType.keys());
  }
}

interface IntegrationConnection {
  integrationName: string;
  status: 'connecting' | 'connected' | 'disconnecting' | 'error';
  config: any;
  connectedAt: number;
  lastHealthCheck: number;
  connection: any;
  error: Error | null;
}

interface ConnectionStatus {
  status: string;
  connectedAt: number;
  lastHealthCheck: number;
  error?: string;
}