import { DurableObject } from "cloudflare:workers";
import { Loggable, Log } from "./loggable-object";

@Loggable
export class ExampleLogDO extends DurableObject {
  log: Log;
  state: DurableObjectState;
  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.state = state;
    state.storage.setAlarm(Date.now() + 10000);
    // this.log("log", "alarm has been set 60 seconds from now");
  }

  alarm() {
    this.log("log", "10secondly alarm fired and new alarm set");
    this.state.storage.setAlarm(Date.now() + 10000);
  }

  async fetch(request: Request): Promise<Response> {
    this.log("log", "Request made");
    return new Response("Found DO. curl /log to stream logs to your terminal");
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
