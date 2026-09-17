/**
 * Build script for mimikkai-connect CLI.
 * Produces two bundles with the package version inlined:
 *  - dist/cli.js       (target: bun)   — for `bunx github:...`
 *  - dist/cli.node.mjs (target: node)  — for `npx github:...`
 */

import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as { version: string };
const versionDefine = `CLI_VERSION="${pkg.version}"`;

mkdirSync("dist", { recursive: true });

for (const [outfile, target, format] of [
  ["dist/cli.js", "bun", undefined],
  ["dist/cli.node.mjs", "node", "esm"],
] as const) {
  const args = [
    "build",
    "./src/cli.ts",
    `--target=${target}`,
    `--outfile=${outfile}`,
    `--define=${versionDefine}`,
    ...(format ? [`--format=${format}`] : []),
  ];
  const proc = Bun.spawnSync(["bun", ...args], { stdout: "inherit", stderr: "inherit" });
  if (proc.exitCode !== 0) {
    console.error(`build failed for ${outfile}`);
    process.exit(proc.exitCode ?? 1);
  }
}

cpSync("locales", "dist/locales", { recursive: true });

// Replace the Bun-injected shebang so npx (node) executes the bundle correctly.
const nodeBundle = readFileSync("dist/cli.node.mjs", "utf-8").replace(/^#!.*$/m, "#!/usr/bin/env node");
await Bun.write("dist/cli.node.mjs", nodeBundle);

console.log("build complete: dist/cli.js (bun), dist/cli.node.mjs (node)");