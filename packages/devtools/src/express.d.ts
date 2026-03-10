declare module "express" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  interface Request extends IncomingMessage {}
  interface Response extends ServerResponse {
    json(data: unknown): void;
    sendFile(path: string): void;
  }

  type RequestHandler = (req: Request, res: Response) => void;

  interface Application {
    (req: IncomingMessage, res: ServerResponse): void;
    get(path: string, handler: RequestHandler): void;
    use(handler: unknown): void;
    use(path: string, handler: unknown): void;
  }

  interface ExpressStatic {
    (): Application;
    static(root: string): unknown;
  }

  const express: ExpressStatic;
  export default express;
}
