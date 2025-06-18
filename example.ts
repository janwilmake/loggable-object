import { DurableObject } from "cloudflare:workers";
import { WithLogger, withLogger } from "./withLogger";

export class ExampleLogDO extends withLogger(DurableObject<Env>, {
  logRetentionHours: 7 * 24,
}) {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Create dummy table and data
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT,
        email TEXT
      )
    `);

    // Insert some dummy data (only if table is empty)
    const count = this.ctx.storage.sql
      .exec("SELECT COUNT(*) as count FROM users")
      .one();

    if (count.count === 0) {
      this.log("Initializing example table with dummy data");

      this.ctx.storage.sql.exec(`
        INSERT INTO users (name, email) VALUES 
        ('Alice', 'alice@example.com'),
        ('Bob', 'bob@example.com'),
        ('Charlie', 'charlie@example.com')
      `);

      this.log("Added 3 users to the database");
    } else {
      this.log(`Database already contains ${count.count} users`);
    }

    // Add some example logs with different levels
    this.log("Application started successfully");
    this.warn("This is a warning message");
    this.error("This is an error message");
    this.log({ action: "startup", status: "complete", timestamp: new Date() });
  }

  async fetch(request: Request): Promise<Response> {
    // Let the parent class handle log-related requests
    const logResponse = await this.handleLogRequest(request);
    if (logResponse) {
      return logResponse;
    }

    const url = new URL(request.url);

    // Add some example routes to generate more logs
    if (url.pathname === "/") {
      this.log(
        `Received request to homepage from ${request.headers.get(
          "User-Agent",
        )}`,
      );

      const users = this.ctx.storage.sql.exec("SELECT * FROM users").toArray();
      return new Response(
        "Hello, world! Check out /log to see the logs.\n\n" +
          JSON.stringify(users, undefined, 2),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (url.pathname === "/error") {
      this.error(
        `Someone triggered an error endpoint at ${new Date().toISOString()}`,
      );
      return new Response("Error logged! Check /log", { status: 400 });
    }

    if (url.pathname === "/warning") {
      this.warn(
        `This is a warning triggered by a user at ${new Date().toISOString()}`,
      );
      return new Response("Warning logged! Check /log");
    }

    // Log the 404 and return not found
    this.warn(`404 Not Found: ${url.pathname}`);
    return new Response("Not found", { status: 404 });
  }
}

// Worker handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const doId = env.EXAMPLE_LOG_DO.idFromName("example-log-instance");
    const doStub = env.EXAMPLE_LOG_DO.get(doId);
    return doStub.fetch(request);
  },
};
