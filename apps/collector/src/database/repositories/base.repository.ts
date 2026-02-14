/**
 * Base Repository Class
 * 
 * Provides common database operations and utilities for all repositories.
 * All specific repositories should extend this class.
 */
import type Database from 'better-sqlite3';
import type { ProxyStats } from '@neko-master/shared';

export abstract class BaseRepository {
  protected db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Convert a Date to minute key format (YYYY-MM-DDTHH:MM:00)
   */
  protected toMinuteKey(date: Date): string {
    return `${date.toISOString().slice(0, 16)}:00`;
  }

  /**
   * Convert a Date to hour key format (YYYY-MM-DDTHH:00:00)
   */
  protected toHourKey(date: Date): string {
    return `${date.toISOString().slice(0, 13)}:00:00`;
  }

  /**
   * Parse minute range from start and end ISO strings
   */
  protected parseMinuteRange(
    start?: string,
    end?: string,
  ): { startMinute: string; endMinute: string } | null {
    if (!start || !end) {
      return null;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate > endDate
    ) {
      return null;
    }

    return {
      startMinute: this.toMinuteKey(startDate),
      endMinute: this.toMinuteKey(endDate),
    };
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  protected withTransaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  /**
   * Split chain string into parts
   */
  protected splitChainParts(chain: string): string[] {
    return chain
      .split(">")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  /**
   * Normalize flow label for comparison
   */
  protected normalizeFlowLabel(label: string): string {
    return label
      .normalize("NFKC")
      .replace(/^[^\p{L}\p{N}]+/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  /**
   * Find rule index in chain parts
   */
  protected findRuleIndexInChain(chainParts: string[], rule: string): number {
    const exactIndex = chainParts.findIndex((part) => part === rule);
    if (exactIndex !== -1) {
      return exactIndex;
    }

    const normalizedRule = this.normalizeFlowLabel(rule);
    if (!normalizedRule) {
      return -1;
    }

    return chainParts.findIndex(
      (part) => this.normalizeFlowLabel(part) === normalizedRule,
    );
  }

  /**
   * Get the first hop from a chain
   */
  protected getChainFirstHop(chain: string): string {
    const parts = this.splitChainParts(chain);
    return parts[0] || chain;
  }

  /**
   * Build a normalized rule flow path in "rule -> ... -> proxy" order
   */
  protected buildRuleFlowPath(rule: string, chain: string): string[] {
    const chainParts = this.splitChainParts(chain);
    if (chainParts.length === 0) {
      return [];
    }

    const ruleIndex = this.findRuleIndexInChain(chainParts, rule);
    if (ruleIndex !== -1) {
      // Full chain stored as proxy > ... > rule, reverse to rule > ... > proxy.
      return chainParts.slice(0, ruleIndex + 1).reverse();
    }

    // Fallback for mismatched labels or minute_dim rows:
    // normalize direction to rule/group -> ... -> proxy.
    const reversed = [...chainParts].reverse();
    const normalizedRule = this.normalizeFlowLabel(rule);
    const normalizedHead = this.normalizeFlowLabel(reversed[0] || "");
    if (normalizedRule && normalizedRule === normalizedHead) {
      return reversed;
    }

    return [rule, ...reversed];
  }

  /**
   * Get unique non-empty values from an array
   */
  protected uniqueNonEmpty(values: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
      const v = (raw || "").trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  /**
   * Aggregate proxy stats by first hop in chain
   */
  protected aggregateProxyStatsByFirstHop(rows: ProxyStats[]): ProxyStats[] {
    const merged = new Map<string, ProxyStats>();

    for (const row of rows) {
      const hop = this.getChainFirstHop(row.chain || "") || "DIRECT";
      const existing = merged.get(hop);
      if (existing) {
        existing.totalUpload += row.totalUpload;
        existing.totalDownload += row.totalDownload;
        existing.totalConnections += row.totalConnections;
        if (row.lastSeen > existing.lastSeen) {
          existing.lastSeen = row.lastSeen;
        }
      } else {
        merged.set(hop, {
          chain: hop,
          totalUpload: row.totalUpload,
          totalDownload: row.totalDownload,
          totalConnections: row.totalConnections,
          lastSeen: row.lastSeen,
        });
      }
    }

    return Array.from(merged.values()).sort(
      (a, b) => (b.totalDownload + b.totalUpload) - (a.totalDownload + a.totalUpload),
    );
  }

  /**
   * Remap range rows from minute_dim_stats to full chains using baseline data
   */
  protected remapRangeRowsToFullChains(
    rangeRows: Array<{ rule: string; chain: string; totalUpload: number; totalDownload: number; totalConnections: number }>,
    baselineRows: Array<{ rule: string; chain: string; totalUpload: number; totalDownload: number; totalConnections: number }>,
  ): Array<{ rule: string; chain: string; totalUpload: number; totalDownload: number; totalConnections: number }> {
    if (rangeRows.length === 0) return [];
    if (baselineRows.length === 0) return rangeRows;

    const baselineByRuleHop = new Map<string, typeof baselineRows>();
    const baselineByNormalizedRuleHop = new Map<string, typeof baselineRows>();
    for (const row of baselineRows) {
      const hop = this.getChainFirstHop(row.chain);
      const key = `${row.rule}|||${hop}`;
      const list = baselineByRuleHop.get(key);
      if (list) { list.push(row); } else { baselineByRuleHop.set(key, [row]); }

      const normalizedRule = this.normalizeFlowLabel(row.rule);
      if (!normalizedRule) continue;
      const normalizedKey = `${normalizedRule}|||${hop}`;
      const normalizedList = baselineByNormalizedRuleHop.get(normalizedKey);
      if (normalizedList) { normalizedList.push(row); } else { baselineByNormalizedRuleHop.set(normalizedKey, [row]); }
    }

    const mapped: typeof rangeRows = [];
    for (const row of rangeRows) {
      const parts = this.splitChainParts(row.chain);
      const alreadyFull = parts.length > 1 && this.findRuleIndexInChain(parts, row.rule) !== -1;
      if (alreadyFull) { mapped.push(row); continue; }

      const hop = this.getChainFirstHop(row.chain);
      const normalizedRule = this.normalizeFlowLabel(row.rule);
      const candidates = baselineByRuleHop.get(`${row.rule}|||${hop}`) ||
        (normalizedRule ? baselineByNormalizedRuleHop.get(`${normalizedRule}|||${hop}`) : undefined);
      if (!candidates || candidates.length === 0) { mapped.push(row); continue; }

      if (candidates.length === 1) {
        mapped.push({ rule: row.rule, chain: candidates[0].chain, totalUpload: row.totalUpload, totalDownload: row.totalDownload, totalConnections: row.totalConnections });
        continue;
      }

      const weights = candidates.map(c => { const t = c.totalUpload + c.totalDownload; return t > 0 ? t : Math.max(1, c.totalConnections); });
      const uploadParts = this.allocateByWeights(row.totalUpload, weights);
      const downloadParts = this.allocateByWeights(row.totalDownload, weights);
      const connParts = this.allocateByWeights(row.totalConnections, weights);
      for (let i = 0; i < candidates.length; i++) {
        mapped.push({ rule: row.rule, chain: candidates[i].chain, totalUpload: uploadParts[i] || 0, totalDownload: downloadParts[i] || 0, totalConnections: connParts[i] || 0 });
      }
    }
    return mapped;
  }

  /**
   * Expand short chains for rules using rule_chain_traffic
   */
  protected expandShortChainsForRules(backendId: number, chains: string[], rules: string[]): string[] {
    const normalizedChains = this.uniqueNonEmpty(chains);
    if (normalizedChains.length === 0) return [];

    const shortChains = normalizedChains.filter((c) => !c.includes(">"));
    if (shortChains.length === 0) return normalizedChains;

    const normalizedRules = this.uniqueNonEmpty(rules);
    const whereParts: string[] = [];
    const params: Array<string | number> = [backendId];

    if (normalizedRules.length > 0) {
      const rulePlaceholders = normalizedRules.map(() => "?").join(", ");
      whereParts.push(`rule IN (${rulePlaceholders})`);
      params.push(...normalizedRules);
    }

    const chainMatchers: string[] = [];
    for (const chain of shortChains) {
      chainMatchers.push("(chain = ? OR chain LIKE ?)");
      params.push(chain, `${chain} > %`);
    }
    whereParts.push(`(${chainMatchers.join(" OR ")})`);

    const whereClause = whereParts.length > 0 ? `AND ${whereParts.join(" AND ")}` : "";
    const stmt = this.db.prepare(`
      SELECT DISTINCT chain FROM rule_chain_traffic WHERE backend_id = ? ${whereClause} LIMIT 500
    `);

    const rows = stmt.all(...params) as Array<{ chain: string }>;
    const expanded = this.uniqueNonEmpty(rows.map((r) => r.chain));
    if (expanded.length === 0) return normalizedChains;

    const fullInputChains = normalizedChains.filter((c) => c.includes(">"));
    return this.uniqueNonEmpty([...expanded, ...fullInputChains]);
  }

  /**
   * Allocate a total value by weights
   */
  protected allocateByWeights(total: number, weights: number[]): number[] {
    if (weights.length === 0) return [];
    const sum = weights.reduce((acc, w) => acc + w, 0);
    if (sum <= 0) {
      const base = Math.floor(total / weights.length);
      const result = new Array(weights.length).fill(base);
      let remainder = total - base * weights.length;
      for (let i = 0; i < result.length && remainder > 0; i++, remainder--) {
        result[i] += 1;
      }
      return result;
    }

    const raw = weights.map(w => (total * w) / sum);
    const floored = raw.map(v => Math.floor(v));
    let remainder = total - floored.reduce((acc, v) => acc + v, 0);
    const order = raw
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < order.length && remainder > 0; k++, remainder--) {
      floored[order[k].i] += 1;
    }
    return floored;
  }
}
