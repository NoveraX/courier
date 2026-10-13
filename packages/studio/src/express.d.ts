declare module "express" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  interface Request extends IncomingMessage {
    body: unknown;
  }
  interface Response extends ServerResponse {
    json(data: unknown): void;
    sendFile(path: string, options?: { root?: string }): void;
    status(code: number): Response;
  }

  type RequestHandler = (req: Request, res: Response) => void | Promise<void>;

  interface Application {
    (req: IncomingMessage, res: ServerResponse): void;
    get(path: string, handler: RequestHandler): void;
    post(path: string, handler: RequestHandler): void;
    disable(setting: string): void;
    enable(setting: string): void;
    use(handler: unknown): void;
    use(path: string, handler: unknown): void;
  }

  interface ExpressStatic {
    (): Application;
    static(root: string): unknown;
    json(options?: { limit?: string | number }): unknown;
  }

  const express: ExpressStatic;
  export default express;
}
