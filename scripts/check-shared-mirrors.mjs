#!/usr/bin/env node
/**
 * Fail if backend/email-service mirrors differ from packages/shared (byte compare).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHARED_MIRROR_GROUPS } from "./shared-mirror-paths.mjs";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function check() {
  const mismatches = [];
  for (const { canonical, mirrors } of SHARED_MIRROR_GROUPS) {
    const srcPath = join(repoRoot, canonical);
    const expected = readFileSync(srcPath, "utf8");
    for (const mirror of mirrors) {
      const destPath = join(repoRoot, mirror);
      const actual = readFileSync(destPath, "utf8");
      if (actual !== expected) {
        mismatches.push({ canonical, mirror });
      }
    }
  }
  if (mismatches.length === 0) {
    console.log("check:shared — all mirrors match packages/shared.");
    return;
  }
  console.error("check:shared — mirror drift detected:\n");
  for (const { canonical, mirror } of mismatches) {
    console.error(`  ${mirror}\n    ≠ ${canonical}`);
  }
  console.error("\nRun from repo root: npm run sync:shared");
  process.exit(1);
}

check();
