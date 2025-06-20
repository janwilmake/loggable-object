# Loggable Object

A TypeScript decorator that adds logging capabilities to Cloudflare Durable Objects with persistent storage and live streaming.

## Installation

```bash
npm install loggable-object
```

````

## Usage

```typescript
import { DurableObject } from "cloudflare:workers";
import { Loggable, Log } from "loggable-object";

@Loggable
export class MyDurableObject extends DurableObject {
  log: Log;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);

    // Start using logging methods
    this.log("log", "Application started");
    this.log("warn", "Something suspicious");
    this.log("error", "Something went wrong");

    // You can also log objects
    this.log("log", { event: "startup", status: "success" });
  }

  async fetch(request: Request): Promise<Response> {
    this.log("log", "Handling request:", request.url);

    try {
      // Your logic here
      this.log("log", "Request processed successfully");
      return new Response("OK");
    } catch (error) {
      this.log("error", "Request failed:", error);
      return new Response("Error", { status: 500 });
    }
  }
}
```

## Features

- **TypeScript Decorator**: Clean decorator syntax using `@Loggable`
- **Persistent Logging**: All logs are stored in a SQLite table named `_logs`
- **Multiple Log Levels**: Support for `log` (info), `warn`, and `error` levels
- **Automatic Log Cleanup**: Older logs are automatically removed (30 days retention by default)
- **Live Streaming**: Real-time log streaming via text/plain HTTP endpoint
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

## Complete Example

```typescript
import { DurableObject } from "cloudflare:workers";
import { Loggable, Log } from "loggable-object";

@Loggable
export class ExampleLogDO extends DurableObject {
  log: Log;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.log("log", "ExampleLogDO initialized");
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    this.log("log", "Handling request:", url.pathname);

    if (url.pathname === "/") {
      return new Response("Hello from Loggable DO!");
    }

    if (url.pathname === "/error") {
      this.log("error", "Simulated error occurred");
      return new Response("Error logged", { status: 500 });
    }

    if (url.pathname === "/warning") {
      this.log("warn", "Simulated warning occurred");
      return new Response("Warning logged");
    }

    return new Response("Not found", { status: 404 });
  }
}

// Worker handler
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const doId = env.EXAMPLE_LOG_DO.idFromName("example-log-instance");
    const doStub = env.EXAMPLE_LOG_DO.get(doId);
    return doStub.fetch(request);
  },
};
```

## Development

1. Set up your `wrangler.toml`:

```toml
name = "loggable-object-example"
main = "src/index.ts"
compatibility_date = "2023-09-01"

[[durable_objects.bindings]]
name = "EXAMPLE_LOG_DO"
class_name = "ExampleLogDO"
```

2. Start development:

```bash
wrangler dev
```

3. Test the endpoints:
   - `http://localhost:8787/` - Main page
   - `http://localhost:8787/log` - Live log stream
   - `http://localhost:8787/error` - Trigger an error log
   - `http://localhost:8787/warning` - Trigger a warning log

## Technical Details

- **Storage**: Uses SQLite storage with automatic table creation
- **Retention**: Logs older than 30 days are automatically cleaned up
- **Performance**: Indexed by timestamp for efficient querying
- **Streaming**: Uses TransformStream for real-time log delivery
- **Memory**: Logs are streamed directly from storage, no memory buffering

## TypeScript Support

The package includes full TypeScript definitions. The `@Loggable` decorator properly types the `log` method:

```typescript
log: Log; // (type: LogLevel, ...data: any[]) => void
```

Where `LogLevel` is `"log" | "warn" | "error"`.
````
