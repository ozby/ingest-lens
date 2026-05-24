#!/usr/bin/env bun

/**
 * Legacy compatibility wrapper.
 *
 * Public Webpresso CI helper migration keeps this path available while routing
 * implementation and docs to `act-with-webpresso.ts`.
 */

export * from "./act-with-webpresso.ts";

import { main } from "./act-with-webpresso.ts";

if (import.meta.main) {
  main();
}
