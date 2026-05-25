#!/usr/bin/env node
/**
 * Copy canonical packages/shared sources into backend and email-service mirrors.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHARED_MIRROR_GROUPS } from "./shared-mirror-paths.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function sync() {
  let copies = 0;
  for (const { canonical, mirrors } of SHARED_MIRROR_GROUPS) {
    const src = join(repoRoot, canonical);
    const body = readFileSync(src, "utf8");
    for (const mirror of mirrors) {
      const dest = join(repoRoot, mirror);
      mkdirSync(dirname(dest), { recursive: true });
      const prev = existsSync(dest) ? readFileSync(dest, "utf8") : null;
      if (prev !== body) {
        copyFileSync(src, dest);
        console.log(prev === null ? `created ${mirror}` : `updated ${mirror}`);
      }
      copies += 1;
    }
  }
  console.log(`sync:shared — ${copies} mirror(s) checked (${SHARED_MIRROR_GROUPS.length} canonical file(s)).`);
}

sync();
