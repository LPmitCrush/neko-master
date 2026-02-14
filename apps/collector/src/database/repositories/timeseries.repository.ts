/**
 * Timeseries Repository
 *
 * Handles time-based traffic queries: hourly stats, today traffic,
 * traffic in range, traffic trend and aggregated trend.
 */
import type Database from 'better-sqlite3';
import type { HourlyStats } from '@neko-master/shared';
import { BaseRepository } from './base.repository.js';

export class TimeseriesRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  getHourlyStats(backendId: number, hours = 24, start?: string, end?: string): HourlyStats[] {
    const range = this.parseMinuteRange(start, end);
    if (range) {
      const stmt = this.db.prepare(`
        SELECT
          substr(minute, 1, 13) || ':00:00' as hour,
          SUM(upload) as upload,
          SUM(download) as download,
          SUM(connections) as connections
        FROM minute_stats
        WHERE backend_id = ? AND minute >= ? AND minute <= ?
        GROUP BY substr(minute, 1, 13)
        ORDER BY hour DESC
        LIMIT ?
      `);
      return stmt.all(backendId, range.startMinute, range.endMinute, hours) as HourlyStats[];
    }

    const stmt = this.db.prepare(`
      SELECT hour, upload, download, connections
      FROM hourly_stats
      WHERE backend_id = ?
      ORDER BY hour DESC
      LIMIT ?
    `);
    return stmt.all(backendId, hours) as HourlyStats[];
  }

  getTodayTraffic(backendId: number): { upload: number; download: number } {
    const today = new Date().toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(upload), 0) as upload, COALESCE(SUM(download), 0) as download
      FROM hourly_stats
      WHERE backend_id = ? AND hour >= ?
    `);
    return stmt.get(backendId, today) as { upload: number; download: number };
  }

  getTrafficInRange(backendId: number, start?: string, end?: string): { upload: number; download: number } {
    const range = this.parseMinuteRange(start, end);
    if (!range) {
      return this.getTodayTraffic(backendId);
    }

    const stmt = this.db.prepare(`
      SELECT
        COALESCE(SUM(upload), 0) as upload,
        COALESCE(SUM(download), 0) as download
      FROM minute_stats
      WHERE backend_id = ? AND minute >= ? AND minute <= ?
    `);
    return stmt.get(backendId, range.startMinute, range.endMinute) as { upload: number; download: number };
  }

  getTrafficTrend(
    backendId: number,
    minutes = 30,
    start?: string,
    end?: string,
  ): Array<{ time: string; upload: number; download: number }> {
    const range = this.parseMinuteRange(start, end);
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const cutoffStr = cutoff.toISOString().slice(0, 16) + ':00';
    const stmt = this.db.prepare(`
      SELECT minute as time, upload, download
      FROM minute_stats
      WHERE backend_id = ? AND minute >= ? AND minute <= ?
      ORDER BY minute ASC
    `);
    return stmt.all(
      backendId,
      range?.startMinute || cutoffStr,
      range?.endMinute || this.toMinuteKey(new Date()),
    ) as Array<{ time: string; upload: number; download: number }>;
  }

  getTrafficTrendAggregated(
    backendId: number,
    minutes = 30,
    bucketMinutes = 1,
    start?: string,
    end?: string,
  ): Array<{ time: string; upload: number; download: number }> {
    const range = this.parseMinuteRange(start, end);
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const cutoffStr = cutoff.toISOString().slice(0, 16) + ':00';
    const endMinute = range?.endMinute || this.toMinuteKey(new Date());

    if (bucketMinutes <= 1) {
      const stmt = this.db.prepare(`
        SELECT minute as time, upload, download
        FROM minute_stats
        WHERE backend_id = ? AND minute >= ? AND minute <= ?
        ORDER BY minute ASC
      `);
      return stmt.all(backendId, range?.startMinute || cutoffStr, endMinute) as Array<{ time: string; upload: number; download: number }>;
    }

    const bucketExpr = `strftime('%Y-%m-%dT%H:%M:00', datetime((strftime('%s', datetime(minute)) / ${bucketMinutes * 60}) * ${bucketMinutes * 60}, 'unixepoch'))`;
    const stmt = this.db.prepare(`
      SELECT
        ${bucketExpr} as time,
        SUM(upload) as upload,
        SUM(download) as download
      FROM minute_stats
      WHERE backend_id = ? AND minute >= ? AND minute <= ?
      GROUP BY ${bucketExpr}
      ORDER BY time ASC
    `);
    return stmt.all(backendId, range?.startMinute || cutoffStr, endMinute) as Array<{ time: string; upload: number; download: number }>;
  }
}
