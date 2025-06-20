// @ts-check
/// <reference lib="esnext" />
/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";

type LogLevel = "log" | "warn" | "error";
type LogFilter = {
  level?: LogLevel;
  search?: string;
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  offset?: number;
};

export type LogEntry = {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
};

export type Log = (type: LogLevel, ...data: any[]) => void;

interface LoggableInterface {
  log: Log;
}

// Mixin function that adds logging capabilities
export function Loggable<T extends new (...args: any[]) => DurableObject>(
  Base: T,
): T & (new (...args: any[]) => LoggableInterface) {
  return class extends Base implements LoggableInterface {
    private retainLogHours = 30 * 24; // 30 days
    private logSubscribers = new Set<WritableStreamDefaultWriter<Uint8Array>>();

    constructor(...args: any[]) {
      super(...args);

      // Initialize logs table
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL
        )
      `);

      this.ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON _logs(timestamp)
      `);
    }

    log: Log = (type: LogLevel, ...data: any[]): void => {
      const timestamp = new Date().toISOString();
      const message = data
        .map((d) => (typeof d === "string" ? d : JSON.stringify(d, null, 2)))
        .join(" ");

      // Store in database
      this.ctx.storage.sql.exec(
        `INSERT INTO _logs (timestamp, level, message) VALUES (?, ?, ?)`,
        timestamp,
        type,
        message,
      );

      // Notify live subscribers
      const logEntry: LogEntry = {
        id: Date.now(),
        timestamp,
        level: type,
        message,
      };

      this.notifySubscribers(logEntry);

      // Clean up old logs
      this.ctx.waitUntil(this.cleanupOldLogs());
    };

    private notifySubscribers(logEntry: LogEntry): void {
      const toRemove: WritableStreamDefaultWriter<Uint8Array>[] = [];

      for (const writer of this.logSubscribers) {
        try {
          const line = `[${
            logEntry.timestamp
          }] ${logEntry.level.toUpperCase()}: ${logEntry.message}\n`;
          const chunk = new TextEncoder().encode(line);
          writer.write(chunk);
        } catch (error) {
          toRemove.push(writer);
        }
      }

      toRemove.forEach((writer) => this.logSubscribers.delete(writer));
    }

    private async cleanupOldLogs(): Promise<void> {
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - this.retainLogHours);

      this.ctx.storage.sql.exec(
        `DELETE FROM _logs WHERE timestamp < ?`,
        cutoffDate.toISOString(),
      );
    }

    private getLogs(filter: LogFilter = {}): {
      logs: LogEntry[];
      total: number;
    } {
      let query = `SELECT * FROM _logs WHERE 1=1`;
      const params: any[] = [];

      if (filter.level) {
        query += ` AND level = ?`;
        params.push(filter.level);
      }

      if (filter.search) {
        query += ` AND message LIKE ?`;
        params.push(`%${filter.search}%`);
      }

      if (filter.from) {
        const fromDate =
          filter.from instanceof Date ? filter.from.toISOString() : filter.from;
        query += ` AND timestamp >= ?`;
        params.push(fromDate);
      }

      if (filter.to) {
        const toDate =
          filter.to instanceof Date ? filter.to.toISOString() : filter.to;
        query += ` AND timestamp <= ?`;
        params.push(toDate);
      }

      // Get total count
      const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as count");
      const countResult = this.ctx.storage.sql
        .exec(countQuery, ...params)
        .one();
      const total = countResult.count as number;

      // Order by timestamp ASC (oldest first, newest last)
      query += ` ORDER BY timestamp ASC`;

      if (filter.limit) {
        query += ` LIMIT ?`;
        params.push(filter.limit);

        if (filter.offset) {
          query += ` OFFSET ?`;
          params.push(filter.offset);
        }
      }

      const logs = this.ctx.storage.sql
        .exec<LogEntry>(query, ...params)
        .toArray();
      return { logs, total };
    }

    private handleLogRequest(request: Request): Response | null {
      const url = new URL(request.url);

      if (url.pathname === "/log" && request.method === "GET") {
        const filter: LogFilter = this.parseLogFilter(url.searchParams);
        const result = this.getLogs(filter);
        return this.streamLogsAsText(result.logs);
      }

      return null;
    }

    private parseLogFilter(searchParams: URLSearchParams): LogFilter {
      const filter: LogFilter = {};

      const level = searchParams.get("level") as LogLevel;
      if (["log", "warn", "error"].includes(level)) {
        filter.level = level;
      }

      if (searchParams.has("search")) {
        filter.search = searchParams.get("search") || undefined;
      }

      if (searchParams.has("from")) {
        filter.from = searchParams.get("from") || undefined;
      }

      if (searchParams.has("to")) {
        filter.to = searchParams.get("to") || undefined;
      }

      if (searchParams.has("limit")) {
        filter.limit = parseInt(searchParams.get("limit") || "100", 10);
      } else {
        filter.limit = 100;
      }

      if (searchParams.has("offset")) {
        filter.offset = parseInt(searchParams.get("offset") || "0", 10);
      }

      return filter;
    }

    private streamLogsAsText(logs: LogEntry[]): Response {
      const { readable, writable } = new TransformStream<
        Uint8Array,
        Uint8Array
      >();
      const writer = writable.getWriter();

      // Add to subscribers for live updates
      this.logSubscribers.add(writer);

      // Start streaming text
      this.startTextStream(writer, logs);

      return new Response(readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    private async startTextStream(
      writer: WritableStreamDefaultWriter<Uint8Array>,
      initialLogs: LogEntry[],
    ): Promise<void> {
      try {
        // Send initial logs (already in chronological order - oldest first)
        for (const log of initialLogs) {
          const line = `[${log.timestamp}] ${log.level.toUpperCase()}: ${
            log.message
          }\n`;
          const chunk = new TextEncoder().encode(line);
          await writer.write(chunk);
        }

        // Send a separator line to show end of historical logs
        const separatorChunk = new TextEncoder().encode(
          "\n--- Live logs start here ---\n\n",
        );
        await writer.write(separatorChunk);

        // Keep connection alive for new logs
        // New logs will be streamed via notifySubscribers as they come in
      } catch (error) {
        this.logSubscribers.delete(writer);
        try {
          await writer.close();
        } catch {}
      }
    }

    // Override fetch to handle log requests
    async fetch(request: Request): Response<Response> {
      const logResponse = this.handleLogRequest(request);
      if (logResponse) {
        return logResponse;
      }

      // Call parent fetch if it exists
      if (super.fetch) {
        return super.fetch(request);
      }

      return new Response("Not found", { status: 404 });
    }
  } as any;
}
