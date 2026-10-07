import {
  Controller,
  Get,
  Header,
  HttpCode,
  Injectable,
  Module,
  Post,
  Query,
  Redirect,
  Res,
} from "@nestjs/common";

import { accounts, outcome } from "./accounts.js";

const page = (body: string): string => `<!doctype html><meta charset="utf-8"><body>${body}</body>`;
const escapeHtml = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

/* Express's response and Fastify's reply both set a header so. */
interface PlatformResponse {
  header(name: string, value: string): unknown;
}

/* The application's own service, which the controller is given; its calls carry the session. */
@Injectable()
export class AccountsService {
  me(): Promise<unknown> {
    return accounts.me();
  }

  async signIn(user: string): Promise<void> {
    await accounts.login({ user });
  }

  async rename(name: string): Promise<void> {
    await accounts.rename({ name });
  }

  async signOut(): Promise<void> {
    await accounts.logout();
  }
}

/* The routes the SvelteKit application has, so one set of checks drives both. */
@Controller()
export class AppController {
  constructor(private readonly service: AccountsService) {}

  @Get()
  @Header("content-type", "text/html; charset=utf-8")
  async home(): Promise<string> {
    const me = await this.service.me();
    return page(`<pre id="me">${escapeHtml(JSON.stringify(me))}</pre>
      <form method="post" action="/?/login"><button id="login">Sign in</button></form>
      <form method="post" action="/?/rename"><button id="rename">Rename</button></form>
      <a id="logout" href="/logout">Sign out</a>`);
  }

  @Post()
  @Redirect("/", 303)
  async act(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: PlatformResponse,
  ): Promise<void> {
    if (!("/login" in query)) return this.service.rename("Ada Lovelace");
    await this.service.signIn("ada");
    response.header("Set-Cookie", "signed_in=yes; Path=/");
  }

  @Get("attack")
  @Header("content-type", "text/html; charset=utf-8")
  async attack(): Promise<string> {
    return page(`<pre id="outcome">${await outcome(this.service.rename("Mallory"))}</pre>`);
  }

  @Get("attack-login")
  @Header("content-type", "text/html; charset=utf-8")
  async attackLogin(): Promise<string> {
    return page(`<pre id="outcome">${await outcome(this.service.signIn("mallory"))}</pre>`);
  }

  @Get("renew")
  @Header("content-type", "text/html; charset=utf-8")
  async renew(): Promise<string> {
    const first = await this.service.me();
    const second = await this.service.me();
    return page(`<pre id="renew">${escapeHtml(JSON.stringify({ first, second }))}</pre>`);
  }

  @Get("logout")
  @Redirect("/", 303)
  async logout(): Promise<void> {
    await this.service.signOut();
  }

  @Post("rename-route")
  @HttpCode(200)
  @Header("content-type", "text/plain; charset=utf-8")
  renameRoute(): Promise<string> {
    return outcome(this.service.rename("Route"));
  }
}

@Module({ controllers: [AppController], providers: [AccountsService] })
export class AppModule {}
