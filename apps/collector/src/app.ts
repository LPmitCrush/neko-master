/**
 * Main Fastify Application
 * 
 * This file registers all controllers and services for the API.
 */

import crypto from 'crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import type { StatsDatabase } from './db.js';
import type { RealtimeStore } from './realtime.js';
import { buildGatewayHeaders, getGatewayBaseUrl, parseSurgeRule } from '@neko-master/shared';
import { SurgePolicySyncService } from './modules/surge/surge-policy-sync.js';

// Import modules
import { BackendService, backendController } from './modules/backend/index.js';
import { StatsService, statsController } from './modules/stats/index.js';
import { AuthService, authController } from './modules/auth/index.js';

// Extend Fastify instance to include services
declare module 'fastify' {
  interface FastifyInstance {
    backendService: BackendService;
    statsService: StatsService;
  }
}

export interface AppOptions {
  port: number;
  db: StatsDatabase;
  realtimeStore: RealtimeStore;
  logger?: boolean;
  policySyncService?: SurgePolicySyncService;
}

export async function createApp(options: AppOptions) {
  const { port, db, realtimeStore, logger = false, policySyncService } = options;
  
  // Create Fastify instance
  const app = Fastify({ logger });

  // Register CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register Cookie — auto-generate a random secret if not configured
  let cookieSecret = process.env.COOKIE_SECRET;
  if (!cookieSecret) {
    cookieSecret = crypto.randomBytes(32).toString('hex');
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[Security] COOKIE_SECRET is not set. A random secret has been generated for this session. ' +
        'Sessions will be invalidated on restart. Set COOKIE_SECRET in your .env for persistence.',
      );
    }
  }
  await app.register(cookie, {
    secret: cookieSecret,
    parseOptions: {},
  });

  // Create services
  const authService = new AuthService(db);
  const backendService = new BackendService(db, realtimeStore, authService);
  const statsService = new StatsService(db, realtimeStore);

  // Decorate Fastify instance with services
  app.decorate('backendService', backendService);
  app.decorate('statsService', statsService);
  app.decorate('authService', authService);

  const getBackendIdFromQuery = (query: Record<string, unknown>): number | null => {
    const backendId = typeof query.backendId === 'string' ? query.backendId : undefined;
    return statsService.resolveBackendId(backendId);
  };

  const isValidHttpUrl = (value: string): boolean => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  // ...

  // Helper to get headers for backend requests
  const getHeaders = (backend: { type: 'clash' | 'surge'; token: string }) => {
    return buildGatewayHeaders(backend);
  };

  // Compatibility routes: Gateway APIs
  app.get('/api/gateway/proxies', async (request, reply) => {
    const backendId = getBackendIdFromQuery(request.query as Record<string, unknown>);
    if (backendId === null) {
      return reply.status(404).send({ error: 'No backend specified or active' });
    }

    const backend = db.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }

    const gatewayBaseUrl = getGatewayBaseUrl(backend.url);
    const isSurge = backend.type === 'surge';
    const headers = getHeaders(backend);

    try {
      if (isSurge) {
        // Surge: Get policies list and details
        const res = await fetch(`${gatewayBaseUrl}/v1/policies`, { headers });
        if (!res.ok) {
          return reply.status(res.status).send({ error: `Surge API error: ${res.status}` });
        }
        
        const data = await res.json() as { proxies: string[]; 'policy-groups': string[] };
        const proxies: Record<string, { name: string; type: string; now?: string }> = {};
        
        // Get current selection for each policy group
        const policyGroups = data['policy-groups'] || [];
        const groupDetails = await Promise.allSettled(
          policyGroups.map(async (groupName: string) => {
            try {
              const detailRes = await fetch(
                `${gatewayBaseUrl}/v1/policies/${encodeURIComponent(groupName)}`,
                { headers, signal: AbortSignal.timeout(5000) }
              );
              if (!detailRes.ok) return { groupName, now: null };
              const detail = await detailRes.json() as { policy?: string };
              return { groupName, now: detail.policy || null };
            } catch {
              return { groupName, now: null };
            }
          })
        );
        
        for (const result of groupDetails) {
          if (result.status === 'fulfilled') {
            const { groupName, now } = result.value;
            proxies[groupName] = { name: groupName, type: 'Selector', now: now || '' };
          }
        }
        
        // Add leaf proxies
        if (data.proxies) {
          for (const name of data.proxies) {
            proxies[name] = { name, type: 'Unknown' };
          }
        }
        
        return { proxies };
      } else {
        // Clash/OpenClash: Direct proxy to /proxies endpoint
        const res = await fetch(`${gatewayBaseUrl}/proxies`, { 
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          return reply.status(res.status).send({ error: `Gateway API error: ${res.status}` });
        }
        return res.json();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reach Gateway API';
      return reply.status(502).send({ error: message });
    }
  });

  // Health check endpoint (not part of any module)
  app.get('/health', async () => ({ status: 'ok' }));

  // Compatibility routes: DB management
  app.get('/api/db/stats', async () => {
    return {
      size: db.getDatabaseSize(),
      totalConnectionsCount: db.getTotalConnectionLogsCount(),
    };
  });

  app.post('/api/db/cleanup', async (request, reply) => {
    if (authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = request.body as { days?: number; backendId?: number };
    const days = body?.days;
    const backendId = typeof body?.backendId === 'number' ? body.backendId : undefined;

    if (typeof days !== 'number' || days < 0) {
      return reply.status(400).send({ error: 'Valid days parameter required' });
    }

    const result = db.cleanupOldData(backendId ?? null, days);

    if (days === 0) {
      if (backendId) {
        realtimeStore.clearBackend(backendId);
      } else {
        const backends = db.getAllBackends();
        for (const backend of backends) {
          realtimeStore.clearBackend(backend.id);
        }
      }

      return {
        message: `Cleaned all data: ${result.deletedConnections} connections, ${result.deletedDomains} domains, ${result.deletedProxies} proxies`,
        deleted: result.deletedConnections,
        domains: result.deletedDomains,
        ips: result.deletedIPs,
        proxies: result.deletedProxies,
        rules: result.deletedRules,
      };
    }

    return {
      message: `Cleaned ${result.deletedConnections} old connection logs`,
      deleted: result.deletedConnections,
    };
  });

  app.post('/api/db/vacuum', async (request, reply) => {
    if (authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    db.vacuum();
    return { message: 'Database vacuumed successfully' };
  });

  app.get('/api/db/retention', async () => {
    return db.getRetentionConfig();
  });

  app.put('/api/db/retention', async (request, reply) => {
    if (authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = request.body as {
      connectionLogsDays?: number;
      hourlyStatsDays?: number;
      autoCleanup?: boolean;
    };

    if (
      body.connectionLogsDays !== undefined &&
      (body.connectionLogsDays < 1 || body.connectionLogsDays > 90)
    ) {
      return reply.status(400).send({ error: 'connectionLogsDays must be between 1 and 90' });
    }

    if (
      body.hourlyStatsDays !== undefined &&
      (body.hourlyStatsDays < 7 || body.hourlyStatsDays > 365)
    ) {
      return reply.status(400).send({ error: 'hourlyStatsDays must be between 7 and 365' });
    }

    const config = db.updateRetentionConfig({
      connectionLogsDays: body.connectionLogsDays,
      hourlyStatsDays: body.hourlyStatsDays,
      autoCleanup: body.autoCleanup,
    });

    return { message: 'Retention configuration updated', config };
  });

  app.get('/api/db/geoip', async () => {
    const current = db.getGeoLookupConfig() as {
      provider?: 'online' | 'local';
      localMmdbReady?: boolean;
    };

    // Auto-fallback persisted config: if local is selected but required MMDB files are gone,
    // switch back to online to keep UI/state consistent with effective runtime behavior.
    if (current.provider === 'local' && current.localMmdbReady === false) {
      return db.updateGeoLookupConfig({ provider: 'online' });
    }

    return current;
  });

  app.put('/api/db/geoip', async (request, reply) => {
    if (authService.isShowcaseMode()) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const body = request.body as {
      provider?: 'online' | 'local';
      onlineApiUrl?: string;
    };

    if (body.provider !== undefined && body.provider !== 'online' && body.provider !== 'local') {
      return reply.status(400).send({ error: "provider must be 'online' or 'local'" });
    }

    if (body.onlineApiUrl !== undefined) {
      const trimmed = body.onlineApiUrl.trim();
      if (!trimmed || !isValidHttpUrl(trimmed)) {
        return reply.status(400).send({ error: 'onlineApiUrl must be a valid http/https URL' });
      }
      body.onlineApiUrl = trimmed;
    }

    if (body.provider === 'local') {
      const current = db.getGeoLookupConfig() as {
        localMmdbReady?: boolean;
        missingMmdbFiles?: string[];
      };
      if (!current.localMmdbReady) {
        return reply.status(400).send({
          error: 'Local MMDB is not ready. Missing required files.',
          missingMmdbFiles: current.missingMmdbFiles || [],
        });
      }
    }

    const config = db.updateGeoLookupConfig({
      provider: body.provider,
      onlineApiUrl: body.onlineApiUrl,
    });

    return { message: 'GeoIP configuration updated', config };
  });

  // Compatibility routes: Gateway APIs
  app.get('/api/gateway/providers/proxies', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const backendId = getBackendIdFromQuery(query);
    const forceRefresh = query.refresh === 'true';
    
    if (backendId === null) {
      return reply.status(404).send({ error: 'No backend specified or active' });
    }

    const backend = db.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }

    const gatewayBaseUrl = getGatewayBaseUrl(backend.url);
    const isSurge = backend.type === 'surge';
    const headers = getHeaders(backend);

    try {
      if (isSurge) {
        // Build response from cache or fetch directly
        const providers: Record<string, { proxies: { name: string; type: string; now?: string }[] }> = {};
        const cacheStatus = policySyncService?.getCacheStatus(backendId);
        
        // Try to use cache first
        if (cacheStatus?.cached && !forceRefresh) {
          const cachedPolicies = db.getSurgePolicyCache(backendId);
          for (const policy of cachedPolicies) {
            if (policy.selectedPolicy) {
              providers[policy.policyGroup] = {
                proxies: [{ name: policy.policyGroup, type: policy.policyType, now: policy.selectedPolicy }]
              };
            }
          }
        }
        
        // If no cache or force refresh, fetch directly from Surge
        if (Object.keys(providers).length === 0 || forceRefresh) {
          try {
            const res = await fetch(`${gatewayBaseUrl}/v1/policies`, { 
              headers, 
              signal: AbortSignal.timeout(10000) 
            });
            
            if (!res.ok) {
              throw new Error(`Surge API error: ${res.status}`);
            }
            
            const data = await res.json() as { 
              proxies: string[]; 
              'policy-groups': string[];
            };
            
            const policyGroups = data['policy-groups'] || [];
            
            // Fetch details for each policy group
            // Surge uses /v1/policy_groups/select?group_name=xxx endpoint
            const groupDetails = await Promise.allSettled(
              policyGroups.map(async (groupName: string) => {
                try {
                  const detailRes = await fetch(
                    `${gatewayBaseUrl}/v1/policy_groups/select?group_name=${encodeURIComponent(groupName)}`,
                    { headers, signal: AbortSignal.timeout(5000) }
                  );
                  if (!detailRes.ok) return null;
                  const detail = await detailRes.json() as { policy?: string; type?: string };
                  return { 
                    name: groupName, 
                    now: detail.policy || '', 
                    type: detail.type || 'Select' 
                  };
                } catch {
                  return null;
                }
              })
            );
            
            // Build providers from fetched data
            let successCount = 0;
            for (const result of groupDetails) {
              if (result.status === 'fulfilled' && result.value && result.value.now) {
                providers[result.value.name] = {
                  proxies: [{ 
                    name: result.value.name, 
                    type: result.value.type, 
                    now: result.value.now 
                  }]
                };
                successCount++;
              }
            }
            
            // Add standalone proxies
            if (data.proxies?.length > 0) {
              providers['default'] = {
                proxies: data.proxies.map(name => ({ name, type: 'Unknown' }))
              };
            }
            
            // Also update cache in background
            if (policySyncService) {
              policySyncService.syncNow(backendId, gatewayBaseUrl, backend.token || undefined)
                .catch(err => console.error(`[Gateway] Background sync failed:`, err.message));
            }
            
          } catch (error) {
            console.error(`[Gateway] Failed to fetch from Surge:`, error);
            if (Object.keys(providers).length === 0) {
              return reply.status(502).send({ 
                error: 'Failed to fetch policies',
                message: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        }

        return {
          providers,
          _cache: cacheStatus ? {
            cached: cacheStatus.cached,
            lastUpdate: cacheStatus.lastUpdate,
            policyCount: cacheStatus.policyCount,
          } : undefined
        };
      } else {
        // Clash/OpenClash: direct proxy
        const res = await fetch(`${gatewayBaseUrl}/providers/proxies`, { 
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          return reply.status(res.status).send({ error: `Gateway API error: ${res.status}` });
        }
        return res.json();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reach Gateway API';
      return reply.status(502).send({ error: message });
    }
  });

  // Manual refresh endpoint for Surge policies
  app.post('/api/gateway/providers/proxies/refresh', async (request, reply) => {
    const backendId = getBackendIdFromQuery(request.query as Record<string, unknown>);
    if (backendId === null) {
      return reply.status(404).send({ error: 'No backend specified or active' });
    }

    const backend = db.getBackend(backendId);
    if (!backend || backend.type !== 'surge') {
      return reply.status(400).send({ error: 'Only Surge backend supports this operation' });
    }

    if (!policySyncService) {
      return reply.status(503).send({ error: 'Policy sync service not available' });
    }

    const gatewayBaseUrl = getGatewayBaseUrl(backend.url);
    const result = await policySyncService.syncNow(
      backendId,
      gatewayBaseUrl,
      backend.token || undefined
    );

    return {
      success: result.success,
      message: result.message,
      updated: result.updated,
    };
  });

  app.get('/api/gateway/rules', async (request, reply) => {
    const backendId = getBackendIdFromQuery(request.query as Record<string, unknown>);
    if (backendId === null) {
      return reply.status(404).send({ error: 'No backend specified or active' });
    }

    const backend = db.getBackend(backendId);
    if (!backend) {
      return reply.status(404).send({ error: 'Backend not found' });
    }

    const gatewayBaseUrl = getGatewayBaseUrl(backend.url);
    const isSurge = backend.type === 'surge';
    const headers = getHeaders(backend);

    try {
      if (isSurge) {
        // Surge uses /v1/rules endpoint
        const res = await fetch(`${gatewayBaseUrl}/v1/rules`, { headers });
        if (!res.ok) {
          return reply.status(res.status).send({ error: `Surge API error: ${res.status}` });
        }
        
        const data = await res.json() as { rules: string[]; 'available-policies': string[] };
        
        // Parse Surge rules to standard format
        const parsedRules = data.rules
          .map(raw => {
            const parsed = parseSurgeRule(raw);
            return parsed ? { type: parsed.type, payload: parsed.payload, policy: parsed.policy, raw } : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);

        return {
          rules: parsedRules.map(r => ({
            type: r.type,
            payload: r.payload,
            proxy: r.policy,
            size: 0,
          })),
          _source: 'surge' as const,
          _availablePolicies: data['available-policies'],
        };
      } else {
        // Clash/OpenClash uses /rules endpoint
        const res = await fetch(`${gatewayBaseUrl}/rules`, { 
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
          return reply.status(res.status).send({ error: `Gateway API error: ${res.status}` });
        }
        return res.json();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reach Gateway API';
      return reply.status(502).send({ error: message });
    }
  });

  // Auth middleware - protects API routes
  app.addHook('onRequest', async (request, reply) => {
    // Skip auth for public routes
    const publicRoutes = [
      '/health',
      '/api/auth/state',
      '/api/auth/verify',
      '/api/auth/logout', // Add logout as public so we can clear cookies even if invalid
    ];
    
    // Check if route is public
    if (publicRoutes.some(route => request.url.startsWith(route))) {
      return;
    }

    // Check if auth is required
    if (!authService.isAuthRequired()) {
      return;
    }

    // Try to get token from Cookie first
    const cookieToken = request.cookies['neko-session'];
    if (cookieToken) {
      const verifyResult = await authService.verifyToken(cookieToken);
      if (verifyResult.valid) {
        return;
      }
    }

    // Fallback: Get token from header (for backward compatibility / API clients)
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const token = authHeader.slice(7);
    const verifyResult = await authService.verifyToken(token);
    
    if (!verifyResult.valid) {
      return reply.status(401).send({ error: verifyResult.message || 'Invalid token' });
    }
  });

  // Register controllers
  await app.register(backendController, { prefix: '/api/backends' });
  await app.register(statsController, { prefix: '/api/stats' });
  await app.register(authController, { prefix: '/api/auth' });

  // Start server
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[API] Server running at http://localhost:${port}`);

  // Start automatic health checks for upstream gateways
  backendService.startHealthChecks();

  return app;
}

export class APIServer {
  private app: ReturnType<typeof Fastify> | null = null;
  private db: StatsDatabase;
  private realtimeStore: RealtimeStore;
  private port: number;
  private policySyncService?: SurgePolicySyncService;

  constructor(
    port: number, 
    db: StatsDatabase, 
    realtimeStore: RealtimeStore,
    policySyncService?: SurgePolicySyncService
  ) {
    this.port = port;
    this.db = db;
    this.realtimeStore = realtimeStore;
    this.policySyncService = policySyncService;
  }

  async start() {
    this.app = await createApp({
      port: this.port,
      db: this.db,
      realtimeStore: this.realtimeStore,
      policySyncService: this.policySyncService,
      logger: false,
    });
    return this.app;
  }

  stop() {
    if (this.app) {
      this.app.close();
      console.log('[API] Server stopped');
    }
  }
}

export default createApp;
