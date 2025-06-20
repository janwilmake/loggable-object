# Loggable Object

A TypeScript decorator that adds logging capabilities to Cloudflare Durable Objects with persistent storage and live streaming. Especially useful for logging in alarms in production DOs as these aren't normally visible.

[![](https://badge.xymake.com/janwilmake/status/1936045989443326226)](https://x.com/janwilmake/status/1936045989443326226)

## Usage

1. `npm i loggable-object`
2. Add `@Loggable` before your DO, and `log: Log;` as first line in your DO (for type safety)
3. Use logs anywhere, also in alarms, via `this.log`
4. Expose your DO `/log` endpoint safely
5. `curl https://yourworker.com/log` for a log stream!

## Complete example

See [example.ts](example.ts) and [wrangler.toml](wrangler.toml)

## Features

- **TypeScript Decorator**: Clean decorator syntax using `@Loggable`
- **Multiple Log Levels**: Support for `log` (info), `warn`, and `error` levels
- **Filtering & Searching**: Get exactly the logs you need
- **Chronological Order**: Logs are displayed oldest-first for better readability

## Log Levels

The `log` method accepts a log level as the first parameter:

```typescript
this.log("log", "Info message"); // Info level
this.log("warn", "Warning message"); // Warning level
this.log("error", "Error message"); // Error level
```

## Accessing Logs

### Live Log Stream

Visit `/log` on your Durable Object to get a live stream of logs in text format:

```bash
curl http://localhost:8787/log
```

This will:

1. First stream all historical logs (oldest to newest)
2. Show a separator line: `--- Live logs start here ---`
3. Continue streaming new logs in real-time as they occur

### API Filtering Options

You can filter logs using URL parameters:

```bash
# Get only error logs
curl "http://localhost:8787/log?level=error"

# Search for specific text
curl "http://localhost:8787/log?search=startup"

# Get logs from a specific time range
curl "http://localhost:8787/log?from=2023-09-01T00:00:00Z&to=2023-09-02T00:00:00Z"

# Limit results with pagination
curl "http://localhost:8787/log?limit=50&offset=100"
```

Available filter parameters:

- `level`: Filter by log level (`log`, `warn`, `error`)
- `search`: Search within log messages
- `from`: Start timestamp (ISO string)
- `to`: End timestamp (ISO string)
- `limit`: Maximum number of logs to return (default: 100)
- `offset`: Pagination offset
