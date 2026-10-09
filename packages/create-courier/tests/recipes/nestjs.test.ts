import { afterAll, describe, expect, it } from "vitest";

import { buildPlan } from "../../src/plan/build-plan";
import { nestRecipe } from "../../src/recipes/nestjs";
import { contextOf, manifest, projectWith, removeProjects } from "./project-fixture";

afterAll(removeProjects);

const APP_MODULE = `import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;

describe("nestRecipe", () => {
  it("imports Courier's module into the root one, and says where the page is", () => {
    const root = projectWith({
      "package.json": manifest(
        { "@nestjs/core": "^12.0.1" },
        { scripts: { "start:dev": "nest start --watch" } },
      ),
      "tsconfig.json": '{ "compilerOptions": { "module": "nodenext" } }',
      "src/app.module.ts": APP_MODULE,
      "src/main.ts": "await app.listen(process.env.PORT ?? 3000);\n",
    });
    const ctx = contextOf(root, "@nestjs/core");
    const recipe = nestRecipe(ctx);
    const edit = buildPlan(ctx, recipe).edits.find(
      (planned) => planned.path === "src/app.module.ts",
    );

    expect(edit?.after).toContain(
      "import { CourierModule } from './courier/courier.module.js';\n\n@Module({\n  imports: [CourierModule],",
    );
    expect(
      recipe.files.find((file) => file.path === "src/courier/courier.module.ts")?.content,
    ).toContain('consumer.apply(courierMiddleware()).forRoutes("api/request");');
    expect(recipe.next.at(-1)).toEqual({
      command: "npm run start:dev",
      what: "starts the app: open http://localhost:3000/courier",
    });
  });
});
