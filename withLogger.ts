import { DurableObject } from "cloudflare:workers";
import { Logger, LoggerOptions } from "./logger";

export type WithLogger<TEnv extends Cloudflare.Env> = DurableObject<TEnv> & {
  getLogger: () => Logger;
};

export const withLogger = <TEnv extends Cloudflare.Env>(
  cls: typeof DurableObject<TEnv>,
  options: LoggerOptions = {}
) => {
  return class extends cls {
    logger: Logger;
    constructor(public ctx: DurableObjectState, public env: TEnv) {
      super(ctx, env);
      this.logger = new Logger(ctx, env, options);
    }
    getLogger() {
      return this.logger;
    }
    log(message: string | object): void {
      this.logger.log(message);
    }

    warn(message: string | object): void {
      this.logger.warn(message);
    }

    error(message: string | object): void {
      this.logger.error(message);
    }
    handleLogRequest(request: Request): Promise<Response | null> {
      return this.logger.handleLogRequest(request);
    }
  };
};
