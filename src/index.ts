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

registry.start();
