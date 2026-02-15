import fs from "node:fs";
import path from "node:path";
import maxmind, {
  type AsnResponse,
  type CityResponse,
  type CountryResponse,
  type Reader,
} from "maxmind";
import type { StatsDatabase } from "./db.js";

export interface GeoLocation {
  country: string;
  country_name: string;
  city: string;
  asn: string;
  as_name: string;
  as_domain: string;
  continent: string;
  continent_name: string;
}

interface GeoLookupConfig {
  provider: "online" | "local";
  mmdbDir: string;
  onlineApiUrl: string;
  localMmdbReady?: boolean;
}

interface GeoIPApiResponse {
  country?: unknown;
  country_name?: unknown;
  city?: unknown;
  asn?: unknown;
  as_name?: unknown;
  as_domain?: unknown;
  continent?: unknown;
  continent_name?: unknown;
  reserved?: unknown;
}

interface LocalMmdbReaders {
  mmdbDir: string;
  cityPath: string;
  asnPath: string;
  countryPath: string | null;
  cityMtimeMs: number;
  asnMtimeMs: number;
  countryMtimeMs: number | null;
  cityReader: Reader<CityResponse>;
  asnReader: Reader<AsnResponse>;
  countryReader: Reader<CountryResponse> | null;
}

export class GeoIPService {
  private db: StatsDatabase;
  private pendingQueries: Map<string, Promise<GeoLocation | null>> = new Map();
  private failedIPs: Map<string, number> = new Map();
  private lastRequestTime: number = 0;
  private lastFailedIPsCleanup: number = 0;
  private queue: {
    ip: string;
    resolve: (value: GeoLocation | null) => void;
  }[] = [];
  private isProcessing: boolean = false;
  private processorTimer: NodeJS.Timeout | null = null;
  private localMmdbReaders: LocalMmdbReaders | null = null;
  private localMmdbLoadPromise: Promise<LocalMmdbReaders | null> | null = null;
  private lastLocalMmdbCheckMs: number = 0;

  private static FAIL_COOLDOWN_MS = 30 * 60 * 1000;
  private static MAX_QUEUE_SIZE = 100;
  private static FAILED_IPS_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
  private static ONLINE_MIN_REQUEST_INTERVAL_MS = 100;
  private static LOCAL_MMDB_RECHECK_INTERVAL_MS = 60 * 1000;

  constructor(db: StatsDatabase) {
    this.db = db;
  }

  async getGeoLocation(ip: string): Promise<GeoLocation | null> {
    if (this.isPrivateIP(ip)) {
      return {
        country: "LOCAL",
        country_name: "Local Network",
        city: "",
        asn: "",
        as_name: "Local Network",
        as_domain: "",
        continent: "LOCAL",
        continent_name: "Local Network",
      };
    }

    const failedAt = this.failedIPs.get(ip);
    if (failedAt && Date.now() - failedAt < GeoIPService.FAIL_COOLDOWN_MS) {
      return null;
    }

    const cached = this.db.getIPGeolocation(ip);
    if (cached) {
      return {
        country: cached.country,
        country_name: cached.country_name,
        city: cached.city,
        asn: cached.asn,
        as_name: cached.as_name,
        as_domain: cached.as_domain,
        continent: cached.continent,
        continent_name: cached.continent_name,
      };
    }

    const pending = this.pendingQueries.get(ip);
    if (pending) {
      return pending;
    }

    const promise = this.queryWithQueue(ip);
    this.pendingQueries.set(ip, promise);

    try {
      return await promise;
    } finally {
      this.pendingQueries.delete(ip);
    }
  }

  private async queryWithQueue(ip: string): Promise<GeoLocation | null> {
    if (this.queue.length >= GeoIPService.MAX_QUEUE_SIZE) {
      return null;
    }
    return new Promise((resolve) => {
      this.queue.push({ ip, resolve });
      this.scheduleProcessing();
    });
  }

  private scheduleProcessing() {
    if (this.processorTimer || this.isProcessing) return;

    const intervalMs = this.getRequestIntervalMs();
    const delay = Math.max(0, intervalMs - (Date.now() - this.lastRequestTime));
    this.processorTimer = setTimeout(() => {
      this.processorTimer = null;
      this.processNext();
    }, delay);
  }

  private getRequestIntervalMs(): number {
    try {
      const config = this.db.getGeoLookupConfig() as GeoLookupConfig;
      const useLocal = config.provider === "local" && config.localMmdbReady !== false;
      return useLocal ? 0 : GeoIPService.ONLINE_MIN_REQUEST_INTERVAL_MS;
    } catch {
      return GeoIPService.ONLINE_MIN_REQUEST_INTERVAL_MS;
    }
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const item = this.queue.shift()!;

    try {
      const result = await this.queryGeo(item.ip);
      this.lastRequestTime = Date.now();
      item.resolve(result);
    } catch (err) {
      console.error(`[GeoIP] Error querying ${item.ip}:`, err);
      item.resolve(null);
    } finally {
      this.isProcessing = false;
      this.cleanupFailedIPs();
      if (this.queue.length > 0) {
        this.scheduleProcessing();
      }
    }
  }

  private cleanupFailedIPs() {
    const now = Date.now();
    if (now - this.lastFailedIPsCleanup < GeoIPService.FAILED_IPS_CLEANUP_INTERVAL_MS) return;
    this.lastFailedIPsCleanup = now;
    for (const [ip, failedAt] of this.failedIPs) {
      if (now - failedAt > GeoIPService.FAIL_COOLDOWN_MS) {
        this.failedIPs.delete(ip);
      }
    }
  }

  private async queryGeo(ip: string): Promise<GeoLocation | null> {
    const config = this.db.getGeoLookupConfig() as GeoLookupConfig;
    const useLocal = config.provider === "local" && config.localMmdbReady !== false;
    if (useLocal) {
      const localResult = await this.queryLocalMMDB(ip, config);
      if (localResult) {
        return localResult;
      }
      // Local mode fallback: MMDB missing/invalid or lookup failed, use online API.
      return this.queryOnlineAPI(ip, config);
    }
    return this.queryOnlineAPI(ip, config);
  }

  private async queryOnlineAPI(
    ip: string,
    config: GeoLookupConfig,
  ): Promise<GeoLocation | null> {
    const lookupUrl = this.buildLookupUrl(config.onlineApiUrl, ip);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      try {
        const response = await fetch(lookupUrl, {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          console.error(`[GeoIP] Online API error for ${ip}: ${response.status}`);
          this.failedIPs.set(ip, Date.now());
          return null;
        }

        const data = (await response.json()) as GeoIPApiResponse;
        const isReserved = data.reserved === true;

        const geo: GeoLocation = isReserved
          ? {
            country: "RESERVED",
            country_name: "Reserved IP",
            city: "",
            asn: "",
            as_name: "Reserved IP",
            as_domain: "",
            continent: "RESERVED",
            continent_name: "Reserved",
          }
          : {
            country: this.toStringValue(data.country, "Unknown"),
            country_name: this.toStringValue(data.country_name, "Unknown"),
            city: this.toStringValue(data.city, ""),
            asn: this.toStringValue(data.asn, ""),
            as_name: this.toStringValue(data.as_name, ""),
            as_domain: this.toStringValue(data.as_domain, ""),
            continent: this.toStringValue(data.continent, "Unknown"),
            continent_name: this.toStringValue(data.continent_name, "Unknown"),
          };

        this.db.saveIPGeolocation(ip, geo);
        return geo;
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.error(`[GeoIP] Online API query failed for ${ip}:`, err);
      this.failedIPs.set(ip, Date.now());
      return null;
    }
  }

  private async queryLocalMMDB(
    ip: string,
    config: GeoLookupConfig,
  ): Promise<GeoLocation | null> {
    if (!maxmind.validate(ip)) {
      this.failedIPs.set(ip, Date.now());
      return null;
    }

    try {
      const readers = await this.ensureLocalMmdbReaders(config.mmdbDir);
      if (!readers) {
        this.failedIPs.set(ip, Date.now());
        return null;
      }

      const cityData = readers.cityReader.get(ip);
      const asnData = readers.asnReader.get(ip);
      const countryData = readers.countryReader?.get(ip) || null;

      const countryCode =
        cityData?.country?.iso_code ||
        countryData?.country?.iso_code ||
        "Unknown";
      const countryName =
        this.pickLocalizedName(cityData?.country?.names) ||
        this.pickLocalizedName(countryData?.country?.names) ||
        countryCode;
      const continentCode =
        cityData?.continent?.code ||
        countryData?.continent?.code ||
        "Unknown";
      const continentName =
        this.pickLocalizedName(cityData?.continent?.names) ||
        this.pickLocalizedName(countryData?.continent?.names) ||
        "Unknown";
      const cityName =
        this.pickLocalizedName(cityData?.city?.names) || "";

      const asnNumber =
        asnData?.autonomous_system_number ??
        cityData?.traits?.autonomous_system_number ??
        countryData?.traits?.autonomous_system_number;
      const asnOrg =
        asnData?.autonomous_system_organization ||
        cityData?.traits?.autonomous_system_organization ||
        countryData?.traits?.autonomous_system_organization ||
        "";
      const asDomain =
        cityData?.traits?.domain ||
        countryData?.traits?.domain ||
        "";

      const geo: GeoLocation = {
        country: countryCode,
        country_name: countryName || "Unknown",
        city: cityName,
        asn: typeof asnNumber === "number" ? `AS${asnNumber}` : "",
        as_name: asnOrg,
        as_domain: asDomain,
        continent: continentCode,
        continent_name: continentName,
      };

      this.db.saveIPGeolocation(ip, geo);
      return geo;
    } catch (err) {
      console.error(`[GeoIP] Local MMDB query failed for ${ip}:`, err);
      this.failedIPs.set(ip, Date.now());
      return null;
    }
  }

  private async ensureLocalMmdbReaders(mmdbDir: string): Promise<LocalMmdbReaders | null> {
    const targetDir = path.resolve(mmdbDir || path.join(process.cwd(), "geoip"));

    const current = this.localMmdbReaders;
    if (current?.mmdbDir === targetDir) {
      const now = Date.now();
      if (now - this.lastLocalMmdbCheckMs < GeoIPService.LOCAL_MMDB_RECHECK_INTERVAL_MS) {
        return current;
      }
      this.lastLocalMmdbCheckMs = now;

      const cityMtimeMs = this.getFileMtimeMs(current.cityPath);
      const asnMtimeMs = this.getFileMtimeMs(current.asnPath);
      const countryMtimeMs = current.countryPath ? this.getFileMtimeMs(current.countryPath) : null;
      const unchanged =
        cityMtimeMs !== null &&
        asnMtimeMs !== null &&
        cityMtimeMs === current.cityMtimeMs &&
        asnMtimeMs === current.asnMtimeMs &&
        countryMtimeMs === current.countryMtimeMs;
      if (unchanged) {
        return current;
      }

      console.log(`[GeoIP] MMDB files changed, reloading from ${targetDir}`);
      this.localMmdbReaders = null;
    }

    if (this.localMmdbLoadPromise) {
      return this.localMmdbLoadPromise;
    }

    this.localMmdbLoadPromise = this.loadLocalMmdbReaders(targetDir)
      .finally(() => {
        this.localMmdbLoadPromise = null;
      });

    return this.localMmdbLoadPromise;
  }

  private async loadLocalMmdbReaders(mmdbDir: string): Promise<LocalMmdbReaders | null> {
    const cityPath = path.join(mmdbDir, "GeoLite2-City.mmdb");
    const asnPath = path.join(mmdbDir, "GeoLite2-ASN.mmdb");
    const countryPath = path.join(mmdbDir, "GeoLite2-Country.mmdb");

    if (!fs.existsSync(cityPath) || !fs.existsSync(asnPath)) {
      console.error(
        `[GeoIP] Missing MMDB file(s) in ${mmdbDir}. Required: GeoLite2-City.mmdb, GeoLite2-ASN.mmdb`,
      );
      return null;
    }

    const cityMtimeMs = this.getFileMtimeMs(cityPath);
    const asnMtimeMs = this.getFileMtimeMs(asnPath);
    const countryMtimeMs = fs.existsSync(countryPath)
      ? this.getFileMtimeMs(countryPath)
      : null;
    if (cityMtimeMs === null || asnMtimeMs === null) {
      console.error(`[GeoIP] Failed to stat required MMDB files under ${mmdbDir}`);
      return null;
    }

    const [cityReader, asnReader, countryReader] = await Promise.all([
      maxmind.open<CityResponse>(cityPath),
      maxmind.open<AsnResponse>(asnPath),
      countryMtimeMs !== null
        ? maxmind.open<CountryResponse>(countryPath)
        : Promise.resolve(null),
    ]);

    this.localMmdbReaders = {
      mmdbDir,
      cityPath,
      asnPath,
      countryPath: countryMtimeMs !== null ? countryPath : null,
      cityMtimeMs,
      asnMtimeMs,
      countryMtimeMs,
      cityReader,
      asnReader,
      countryReader,
    };
    this.lastLocalMmdbCheckMs = Date.now();

    console.log(`[GeoIP] Local MMDB loaded from ${mmdbDir}`);
    return this.localMmdbReaders;
  }

  private getFileMtimeMs(filePath: string): number | null {
    try {
      return fs.statSync(filePath).mtimeMs;
    } catch {
      return null;
    }
  }

  private buildLookupUrl(baseUrl: string, ip: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set("ip", ip);
    if (!url.searchParams.has("meituan")) {
      url.searchParams.set("meituan", "false");
    }
    return url.toString();
  }

  private pickLocalizedName(names: unknown): string {
    if (!names || typeof names !== "object") return "";
    const record = names as Record<string, unknown>;
    if (typeof record.en === "string" && record.en) return record.en;
    if (typeof record["zh-CN"] === "string" && record["zh-CN"]) return record["zh-CN"];
    for (const value of Object.values(record)) {
      if (typeof value === "string" && value) return value;
    }
    return "";
  }

  private toStringValue(value: unknown, fallback: string): string {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
    return fallback;
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^0\./,
      /^255\./,
      /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
    ];

    if (ip.includes(":")) {
      return (
        ip.startsWith("fc") ||
        ip.startsWith("fd") ||
        ip.startsWith("fe80") ||
        ip.startsWith("::1") ||
        ip === "::1"
      );
    }

    return privateRanges.some((range) => range.test(ip));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async bulkQueryIPs(ips: string[]): Promise<void> {
    const uniqueIPs = [...new Set(ips)].filter((ip) => !this.isPrivateIP(ip));
    const config = this.db.getGeoLookupConfig() as GeoLookupConfig;
    const useLocal = config.provider === "local" && config.localMmdbReady !== false;
    const delayMs = useLocal ? 0 : 150;

    for (const ip of uniqueIPs) {
      const cached = this.db.getIPGeolocation(ip);
      if (!cached) {
        await this.getGeoLocation(ip);
        if (delayMs > 0) {
          await this.sleep(delayMs);
        }
      }
    }
  }
}
