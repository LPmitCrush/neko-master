/**
 * Backend Service - Business logic for backend management
 */

import type { StatsDatabase } from '../../db.js';
import type { RealtimeStore } from '../../realtime.js';
import type {
  BackendConfig,
  CreateBackendInput,
  UpdateBackendInput,
  BackendResponse,
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
  constructor(
    private db: StatsDatabase,
    private realtimeStore: RealtimeStore,
    private authService: AuthService,
  ) {}

  /**
   * Get all backends (with token hidden)
   */
  getAllBackends(): BackendResponse[] {
    const backends = this.db.getAllBackends();
    const isShowcase = this.authService.isShowcaseMode();

    return backends.map(({ token, ...rest }) => ({
      ...rest,
      hasToken: !!token,
      url: isShowcase ? maskUrl(rest.url) : rest.url,
    }));
  }

  /**
   * Get active backend
   */
  getActiveBackend(): BackendResponse | { error: string } {
    const backend = this.db.getActiveBackend();
    if (!backend) {
      return { error: 'No active backend configured' };
    }
    const { token, ...rest } = backend;
    const isShowcase = this.authService.isShowcaseMode();

    return { 
      ...rest, 
      hasToken: !!token,
      url: isShowcase ? maskUrl(rest.url) : rest.url,
    };
  }

  /**
   * Get listening backends
   */
  getListeningBackends(): BackendResponse[] {
    const backends = this.db.getListeningBackends();
    const isShowcase = this.authService.isShowcaseMode();

    return backends.map(({ token, ...rest }) => ({
      ...rest,
      hasToken: !!token,
      url: isShowcase ? maskUrl(rest.url) : rest.url,
    }));
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
    const { name, url, token } = input;
    
    // Check if this is the first backend
    const existingBackends = this.db.getAllBackends();
    const isFirstBackend = existingBackends.length === 0;
    
    const id = this.db.createBackend({ name, url, token });
    
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
    });
  }

  /**
   * Test connection to a backend
   */
  async testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
    const { url, token } = input;
    
    try {
      const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://');
      const fullUrl = wsUrl.includes('/connections') ? wsUrl : `${wsUrl}/connections`;
      
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Try to establish WebSocket connection
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
}
