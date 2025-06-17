// @ts-check
/// <reference lib="esnext" />
/// <reference types="@cloudflare/workers-types" />

import { DurableObject } from "cloudflare:workers";

type LogLevel = "info" | "warn" | "error";
type LogFilter = {
  level?: LogLevel;
  search?: string;
  from?: Date | string;
  to?: Date | string;
  limit?: number;
  offset?: number;
};

export type Log = {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
};
export class LoggableObject extends DurableObject {
  // Default log retention period in hours
  protected retainLogHours = 30 * 24; // 30 days

  constructor(
    public readonly ctx: DurableObjectState,
    public readonly env: any,
  ) {
    super(ctx, env);

    // Create logs table if it doesn't exist
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL
      )
    `);

    // Create index on timestamp for efficient filtering and cleanup
    this.ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON _logs(timestamp)
    `);
  }

  // Log methods that replace console.log/warn/error
  log(message: string | object): void {
    this._addLogEntry("info", message);
  }

  warn(message: string | object): void {
    this._addLogEntry("warn", message);
  }

  error(message: string | object): void {
    this._addLogEntry("error", message);
  }

  private _addLogEntry(level: LogLevel, message: string | object): void {
    const timestamp = new Date().toISOString();
    const messageStr =
      typeof message === "string" ? message : JSON.stringify(message);

    this.ctx.storage.sql.exec(
      `INSERT INTO _logs (timestamp, level, message) VALUES (?, ?, ?)`,
      timestamp,
      level,
      messageStr,
    );

    // Clean up old logs in waitUntil to not block the main execution
    this.ctx.waitUntil(this._cleanupOldLogs());
  }

  private async _cleanupOldLogs(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - this.retainLogHours);

    this.ctx.storage.sql.exec(
      `DELETE FROM _logs WHERE timestamp < ?`,
      cutoffDate.toISOString(),
    );
  }

  // Get logs with optional filtering
  getLogs(filter: LogFilter = {}): {
    logs: Log[];
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

    // Get total count for pagination
    const countQuery = query.replace("SELECT *", "SELECT COUNT(*) as count");
    const countResult = this.ctx.storage.sql.exec(countQuery, ...params).one();
    const total = countResult.count as number;

    // Order by timestamp descending (newest first)
    query += ` ORDER BY timestamp DESC`;

    // Add pagination
    if (filter.limit) {
      query += ` LIMIT ?`;
      params.push(filter.limit);

      if (filter.offset) {
        query += ` OFFSET ?`;
        params.push(filter.offset);
      }
    }

    const logs = this.ctx.storage.sql.exec<Log>(query, ...params).toArray();
    return { logs, total };
  }

  // Handle log-related HTTP requests
  async handleLogRequest(request: Request): Promise<Response | null> {
    const url = new URL(request.url);

    if (url.pathname === "/log" && request.method === "GET") {
      // Parse query parameters for filtering
      const filter: LogFilter = {};

      if (url.searchParams.has("level")) {
        const level = url.searchParams.get("level") as LogLevel;
        if (["info", "warn", "error"].includes(level)) {
          filter.level = level;
        }
      }

      if (url.searchParams.has("search")) {
        filter.search = url.searchParams.get("search") || undefined;
      }

      if (url.searchParams.has("from")) {
        filter.from = url.searchParams.get("from") || undefined;
      }

      if (url.searchParams.has("to")) {
        filter.to = url.searchParams.get("to") || undefined;
      }

      if (url.searchParams.has("limit")) {
        filter.limit = parseInt(url.searchParams.get("limit") || "100", 10);
      } else {
        filter.limit = 100; // Default limit
      }

      if (url.searchParams.has("offset")) {
        filter.offset = parseInt(url.searchParams.get("offset") || "0", 10);
      }

      const result = this.getLogs(filter);

      // Check if HTML is acceptable
      const acceptHeader = request.headers.get("Accept") || "";
      if (acceptHeader.includes("text/html")) {
        return this.renderLogsAsHtml(result, filter);
      }

      // Otherwise return JSON
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return null;
  }

  private renderLogsAsHtml(
    result: { logs: Array<any>; total: number },
    filter: LogFilter,
  ): Response {
    const { logs, total } = result;
    const limit = filter.limit || 100;
    const offset = filter.offset || 0;
    const nextOffset = offset + limit;
    const prevOffset = Math.max(0, offset - limit);

    // Build query string for pagination links
    const queryParams = new URLSearchParams();
    if (filter.level) queryParams.set("level", filter.level);
    if (filter.search) queryParams.set("search", filter.search);
    if (filter.from) queryParams.set("from", filter.from.toString());
    if (filter.to) queryParams.set("to", filter.to.toString());
    queryParams.set("limit", limit.toString());

    const nextQueryParams = new URLSearchParams(queryParams);
    nextQueryParams.set("offset", nextOffset.toString());

    const prevQueryParams = new URLSearchParams(queryParams);
    prevQueryParams.set("offset", prevOffset.toString());

    // Generate HTML
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Logs</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.5; }
        h1 { margin-top: 0; }
        .filters { margin-bottom: 20px; padding: 15px; background: #f5f5f5; border-radius: 5px; }
        .filters form { display: flex; flex-wrap: wrap; gap: 10px; }
        .filters label { display: block; margin-bottom: 3px; font-weight: bold; }
        .filters select, .filters input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .filters button { padding: 8px 16px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .filters button:hover { background: #0051cc; }
        .log-table { width: 100%; border-collapse: collapse; }
        .log-table th, .log-table td { text-align: left; padding: 10px; border-bottom: 1px solid #eaeaea; }
        .log-table th { background: #f9f9f9; }
        .log-table tr:hover { background: #f5f5f5; }
        .log-info { color: #333; }
        .log-warn { color: #f59f00; }
        .log-error { color: #e03131; }
        .pagination { margin-top: 20px; display: flex; gap: 10px; justify-content: center; }
        .pagination a { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; text-decoration: none; color: #0070f3; }
        .pagination a:hover { background: #f5f5f5; }
        .pagination span { padding: 8px 12px; }
        pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
      </style>
    </head>
    <body>
      <h1>Logs</h1>
      
      <div class="filters">
        <form method="GET" action="/log">
          <div>
            <label for="level">Level</label>
            <select id="level" name="level">
              <option value="" ${!filter.level ? "selected" : ""}>All</option>
              <option value="info" ${
                filter.level === "info" ? "selected" : ""
              }>Info</option>
              <option value="warn" ${
                filter.level === "warn" ? "selected" : ""
              }>Warn</option>
              <option value="error" ${
                filter.level === "error" ? "selected" : ""
              }>Error</option>
            </select>
          </div>
          
          <div>
            <label for="search">Search</label>
            <input type="text" id="search" name="search" placeholder="Search logs..." value="${
              filter.search || ""
            }">
          </div>
          
          <div>
            <label for="from">From</label>
            <input type="datetime-local" id="from" name="from" value="${
              filter.from || ""
            }">
          </div>
          
          <div>
            <label for="to">To</label>
            <input type="datetime-local" id="to" name="to" value="${
              filter.to || ""
            }">
          </div>
          
          <div>
            <label for="limit">Limit</label>
            <input type="number" id="limit" name="limit" min="1" max="1000" value="${limit}">
          </div>
          
          <div>
            <label>&nbsp;</label>
            <button type="submit">Apply Filters</button>
          </div>
        </form>
      </div>
      
      <p>Showing ${offset + 1}-${Math.min(
      offset + limit,
      total,
    )} of ${total} logs</p>
      
      <table class="log-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Level</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          ${logs
            .map(
              (log) => `
            <tr class="log-${log.level}">
              <td>${new Date(log.timestamp).toLocaleString()}</td>
              <td>${log.level.toUpperCase()}</td>
              <td><pre>${this._escapeHtml(log.message)}</pre></td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>
      
      <div class="pagination">
        ${
          offset > 0
            ? `<a href="/log?${prevQueryParams.toString()}">Previous</a>`
            : "<span>Previous</span>"
        }
        ${
          nextOffset < total
            ? `<a href="/log?${nextQueryParams.toString()}">Next</a>`
            : "<span>Next</span>"
        }
      </div>
    </body>
    </html>
    `;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Helper function to escape HTML
  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Override fetch to handle log requests and other app logic
  async fetch(request: Request): Promise<Response> {
    // First check if this is a log request
    const logResponse = await this.handleLogRequest(request);
    if (logResponse) {
      return logResponse;
    }

    // Default fallback - should be overridden by subclasses
    return new Response("Not found", { status: 404 });
  }
}
