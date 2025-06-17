# Loggable Object

A Durable Object class that provides logging capabilities with persistent storage and a web interface.

## Installation

```
npm i loggable-object
```

## Usage

```typescript
import { LoggableDO } from "loggable-object";

export class MyDurableObject extends LoggableDO {
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    
    // Optionally customize log retention period (in hours)
    this.retainLogHours = 14 * 24; // 14 days
    
    // Start using logging methods
    this.log("Application started");
    this.warn("Something suspicious");
    this.error("Something went wrong");
    
    // You can also log objects
    this.log({ event: "startup", status: "success" });
  }
  
  // Your regular DO methods...
}
```

## Features

- **Persistent Logging**: All logs are stored in a SQLite table named `_logs`
- **Multiple Log Levels**: Support for `log` (info), `warn`, and `error` levels
- **Automatic Log Cleanup**: Older logs are automatically removed based on retention period
- **Filtering & Searching**: Get exactly the logs you need
- **Web Interface**: Built-in HTML view of logs with filtering and pagination
- **JSON API**: Get logs programmatically in JSON format

## Accessing Logs

### Web Interface

Visit `/log` on your Durable Object to see a user-friendly log viewer with filtering options.

### Programmatic Access

You can use the `getLogs()` method in your code:

```typescript
// Get all logs
const allLogs = this.getLogs();

// Get filtered logs
const errorLogs = this.getLogs({ 
  level: "error",
  from: "2023-09-01T00:00:00Z",
  limit: 50
});
```

### API Filtering Options

The following filter options are available for both the `getLogs()` method and `/log` endpoint:

- `level`: Filter by log level (`info`, `warn`, `error`)
- `search`: Search log messages
- `from`: Start timestamp
- `to`: End timestamp
- `limit`: Maximum number of logs to return
- `offset`: Pagination offset

## Example

1. Start the application:
```
wrangler dev
```

2. Visit the endpoints:
   - `http://localhost:3000/` - Main page
   - `http://localhost:3000/log` - Log viewer
   - `http://localhost:3000/error` - Trigger an error log
   - `http://localhost:3000/warning` - Trigger a warning log

3. View logs via API:
```
curl http://localhost:3000/log
curl "http://localhost:3000/log?level=error&limit=10"
```