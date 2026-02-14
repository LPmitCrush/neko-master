/**
 * Backend Service - Business logic for backend management
 * Includes automatic health checking for upstream gateways
 */

import type { StatsDatabase } from '../../db.js';
import type { RealtimeStore } from '../../realtime.js';
import type {
  BackendConfig,
  CreateBackendInput,
  UpdateBackendInput,
  BackendResponse,
  BackendHealthInfo,
  TestConnectionInput,
  TestConnectionResult,
  CreateBackendResult,
} from './backend.types.js';

import type { AuthService } from '../auth/auth.service.js';

/**
 * Mask URL for showcase mode - hides host, port, credentials
 * Handles various URL formats including IPv6 addresses
 */
function maskUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Only keep protocol, mask everything else
    return `${urlObj.protocol}//******`;
  } catch {
    // If URL parsing fails, use regex fallback
    // This regex handles: protocol://[anything-until-slash-or-end]
    return url.replace(/:\/\/[^\/]+/, '://******');
  }
}

export class BackendService {
  private healthStatus = new Map<number, BackendHealthInfo>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

  constructor(
    private db: StatsDatabase,
    private realtimeStore: RealtimeStore,
    private authService: AuthService,
  ) {}

  /**
   * Start automatic health checks for all listening backends
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) return;
    
    console.log('[BackendService] Starting automatic health checks');
    
    // Run initial check
    this.runHealthChecks();
    
    // Schedule periodic checks
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Stop automatic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[BackendService] Stopped automatic health checks');
    }
  }

  /**
   * Get health status for a specific backend
   */
  getHealthStatus(backendId: number): BackendHealthInfo | undefined {
    return this.healthStatus.get(backendId);
  }

  /**
   * Run health checks for all listening backends
   */
  private async runHealthChecks(): Promise<void> {
    const backends = this.db.getListeningBackends();
    
    for (const backend of backends) {
      try {
        const startTime = Date.now();
        const result = await this.testConnection({
          url: backend.url,
          token: backend.token,
          type: backend.type,
        });
        const latency = Date.now() - startTime;
        
        const health: BackendHealthInfo = {
          status: result.success ? 'healthy' : 'unhealthy',
          lastChecked: Date.now(),
          message: result.message,
          latency: result.success ? latency : undefined,
        };
        
        // Only log when status changes or on failure
        const prevHealth = this.healthStatus.get(backend.id);
        if (!result.success || prevHealth?.status !== health.status) {
          console.log(`[BackendService] Health check for ${backend.name}: ${health.status}${result.message ? ` - ${result.message}` : ''}`);
        }
        
        this.healthStatus.set(backend.id, health);
      } catch (error) {
        const health: BackendHealthInfo = {
          status: 'unhealthy',
          lastChecked: Date.now(),
          message: error instanceof Error ? error.message : 'Health check failed',
        };
        this.healthStatus.set(backend.id, health);
        console.warn(`[BackendService] Health check error for ${backend.name}:`, error);
      }
    }
  }

  /**
   * Attach health status to backend response
   */
  private attachHealthStatus(backend: BackendResponse): BackendResponse {
    const health = this.healthStatus.get(backend.id);
    if (health) {
      return { ...backend, health };
    }
    return backend;
  }

  /**
   * Get all backends (with token hidden and health status attached)
   */
  getAllBackends(): BackendResponse[] {
    const backends = this.db.getAllBackends();
    const isShowcase = this.authService.isShowcaseMode();

    return backends.map(({ token, ...rest }) => 
      this.attachHealthStatus({
        ...rest,
        hasToken: !!token,
        url: isShowcase ? maskUrl(rest.url) : rest.url,
      })
    );
  }

  /**
   * Get active backend (with health status attached)
   */
  getActiveBackend(): BackendResponse | { error: string } {
    const backend = this.db.getActiveBackend();
    if (!backend) {
      return { error: 'No active backend configured' };
    }
    const { token, ...rest } = backend;
    const isShowcase = this.authService.isShowcaseMode();

    return this.attachHealthStatus({ 
      ...rest, 
      hasToken: !!token,
      url: isShowcase ? maskUrl(rest.url) : rest.url,
    });
  }

  /**
   * Get listening backends (with health status attached)
   */
  getListeningBackends(): BackendResponse[] {
    const backends = this.db.getListeningBackends();
    const isShowcase = this.authService.isShowcaseMode();

    return backends.map(({ token, ...rest }) => 
      this.attachHealthStatus({
        ...rest,
        hasToken: !!token,
        url: isShowcase ? maskUrl(rest.url) : rest.url,
      })
    );
  }

  /**
   * Get a single backend by ID
   */
  getBackend(id: number): BackendConfig | undefined {
    const backend = this.db.getBackend(id);
    if (!backend) return undefined;

    if (this.authService.isShowcaseMode()) {
      return {
        ...backend,
        url: maskUrl(backend.url),
      };
    }
    return backend;
  }

  /**
   * Create a new backend
   */
  createBackend(input: CreateBackendInput): CreateBackendResult {
    const { name, url, token, type = 'clash' } = input;
    
    // Check if this is the first backend
    const existingBackends = this.db.getAllBackends();
    const isFirstBackend = existingBackends.length === 0;
    
    const id = this.db.createBackend({ name, url, token, type });
    
    // If this is the first backend, automatically set it as active
    if (isFirstBackend) {
      this.db.setActiveBackend(id);
      console.log(`[API] First backend created, automatically set as active: ${name} (ID: ${id})`);
    }
    
    return { id, isActive: isFirstBackend, message: 'Backend created successfully' };
  }

  /**
   * Update a backend
   */
  updateBackend(id: number, input: UpdateBackendInput): { message: string } {
    this.db.updateBackend(id, input);
    return { message: 'Backend updated successfully' };
  }

  /**
   * Delete a backend
   */
  deleteBackend(id: number): { message: string } {
    this.db.deleteBackend(id);
    return { message: 'Backend deleted successfully' };
  }

  /**
   * Set active backend
   */
  setActiveBackend(id: number): { message: string } {
    this.db.setActiveBackend(id);
    return { message: 'Backend activated successfully' };
  }

  /**
   * Set listening state for a backend
   */
  setBackendListening(id: number, listening: boolean): { message: string } {
    this.db.setBackendListening(id, listening);
    return { message: `Backend ${listening ? 'started' : 'stopped'} listening` };
  }

  /**
   * Clear all data for a specific backend
   */
  clearBackendData(id: number): { message: string } {
    this.db.deleteBackendData(id);
    // Also clear realtime cache
    this.realtimeStore.clearBackend(id);
    return { message: 'Backend data cleared successfully' };
  }

  /**
   * Test connection to a backend (uses stored token)
   */
  async testExistingBackendConnection(id: number): Promise<TestConnectionResult> {
    const backend = this.db.getBackend(id);
    if (!backend) {
      throw new Error('Backend not found');
    }

    return this.testConnection({
      url: backend.url,
      token: backend.token,
      type: backend.type,
    });
  }

  /**
   * Test connection to a backend
   */
  async testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
    const { url, token, type = 'clash' } = input;
    
    if (type === 'surge') {
      return this.testSurgeConnection(url, token);
    }
    
    return this.testClashConnection(url, token);
  }

  /**
   * Test Clash WebSocket connection
   */
  private async testClashConnection(url: string, token?: string): Promise<TestConnectionResult> {
    try {
      const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://');
      const fullUrl = wsUrl.includes('/connections') ? wsUrl : `${wsUrl}/connections`;
      
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const WebSocket = (await import('ws')).default;
      
      return new Promise((resolve) => {
        const ws = new WebSocket(fullUrl, { headers, timeout: 5000 });
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          ws.terminate();
          resolve({ success: false, message: 'Connection timeout' });
        }, 5000);

        const finish = (result: TestConnectionResult): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(result);
        };

        ws.on('open', () => {
          ws.close();
          finish({ success: true, message: 'Connection successful' });
        });

        ws.on('error', (error: unknown) => {
          const message = error instanceof Error ? error.message : 'Connection failed';
          finish({ success: false, message });
        });

        ws.on('close', (code: number) => {
          if (code !== 1000 && code !== 1005) {
            finish({ success: false, message: `Connection closed with code ${code}` });
          }
        });
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      return { success: false, message };
    }
  }

  /**
   * Test Surge HTTP REST API connection
   * Uses /v1/environment endpoint for lightweight health check
   */
  private async testSurgeConnection(url: string, token?: string): Promise<TestConnectionResult> {
    try {
      const baseUrl = url.replace(/\/$/, '');
      // Use /v1/environment for health check (lightweight, always available)
      const testUrl = `${baseUrl}/v1/environment`;
      
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      
      if (token) {
        headers['x-key'] = token;
      }
      
      const response = await fetch(testUrl, {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return { success: false, message: 'Authentication failed - check your API key' };
        }
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }

      const data = await response.json() as Record<string, unknown>;
      if (data && typeof data === 'object' && data.deviceName) {
        return { success: true, message: `Connected to Surge (${String(data.deviceName)})` };
      }
      
      return { success: false, message: 'Invalid response format from Surge API' };
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, message: 'Connection timeout - check if Surge HTTP API is enabled' };
        }
        return { success: false, message: error.message };
      }
      return { success: false, message: 'Connection failed' };
    }
  }
}
