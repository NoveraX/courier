import { Component, provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { routes } from "@noverax/courier/routes";

/* The page shows the routes Courier's builder built from the config, which the browser runs. */
@Component({
  selector: "app-root",
  template: `<p id="client-routes">{{ endpoints }}</p>`,
})
class App {
  readonly endpoints = Object.keys(routes.catalog?.endpoints ?? {}).join(",");
}

/* Without Zone.js, as Angular 21 and later run by default and Angular 20 runs when asked. */
bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).catch(
  (error: unknown) => console.error(error),
);
