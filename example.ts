import { DurableObject } from "cloudflare:workers";
import { Loggable, Log } from "./loggable-object";

@Loggable
export class ExampleLogDO extends DurableObject {
  log: Log;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
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

// Worker handler
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const doId = env.EXAMPLE_LOG_DO.idFromName("example-log-instance");
    const doStub = env.EXAMPLE_LOG_DO.get(doId);
    return doStub.fetch(request);
  },
};
