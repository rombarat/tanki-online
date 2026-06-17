import * as fs from "fs";
import { fileURLToPath } from "url";

// Polyfill native fetch to support file:// URLs on Node.js (resolves undici makeNetworkError)
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input: any, init?: any) {
  const urlStr = typeof input === "string" ? input : input.href || input.url || "";
  if (urlStr.startsWith("file://")) {
    try {
      const filePath = fileURLToPath(urlStr);
      const data = fs.readFileSync(filePath);
      return Promise.resolve(new Response(data, {
        status: 200,
        headers: { "Content-Type": urlStr.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" }
      }));
    } catch (err) {
      return Promise.reject(err);
    }
  }
  return originalFetch(input, init);
} as any;

import { setup } from "rivetkit";
import { tankMatchmaker } from "./actors/tank-matchmaker.ts";
import { tankMatch } from "./actors/tank-match.ts";

export const registry = setup({
  use: { tankMatchmaker, tankMatch },
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 6420;

if (process.env.PORT) {
  // Production (Rivet Compute): run as a serverless actor pool that registers
  // with the managed engine. The platform sets PORT and provides the engine.
  console.log(`Starting serverless HTTP server on port ${port}`);
  registry.listen({ port });
} else {
  // Local dev: boot the embedded Rivet engine (listens on 6420) together with
  // the serverful actor envoy. Without the engine, the client has nothing to
  // connect to on 6420, so matchmaking hangs and the player is stuck on a
  // blank arena. `RIVET_RUN_ENGINE=1` is what enables the local engine.
  process.env.RIVET_RUN_ENGINE = "1";
  console.log(`Starting local engine + actor server on port ${port}`);
  registry.start();
}
