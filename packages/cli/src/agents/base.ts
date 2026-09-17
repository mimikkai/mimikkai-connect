/**
 * Shared base for agent-tool managers (Claude Code, Codex, ...).
 * Pattern borrowed from @z_ai/coding-helper's *-manager.js modules.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { logger } from "../utils/logger.ts";

export interface AgentDetectResult {
  plan: string | null;
  apiKey: string | null;
}

export interface AgentManager {
  /** Stable tool id used in CLI args (e.g. "claude", "codex"). */
  readonly id: string;
  /** Human-readable display name. */
  readonly displayName: string;
  /** Directory whose existence signals the tool is installed. */
  readonly installMarkerDir: string;
  /** Default model written into the tool config. */
  readonly defaultModel: string;
  isInstalled(): boolean;
  loadConfig(plan: string, litellmKey: string, model?: string): Promise<void>;
  unloadConfig(): Promise<void>;
  detectCurrentConfig(): AgentDetectResult;
}

export function homePath(...segments: string[]): string {
  return join(homedir(), ...segments);
}

export function ensureDirFor(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.debug("agents", `created config dir ${dir}`);
  }
}

/** Read and parse a JSON file; returns {} when missing/corrupt. */
export function readJsonFile<T extends object>(filePath: string): T {
  if (!existsSync(filePath)) return {} as T;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (error) {
    logger.warn("agents", `failed to read ${filePath}: ${error}`);
    return {} as T;
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  ensureDirFor(filePath);
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
  logger.info("agents", `saved ${filePath}`);
}

/** Remove the given keys from an object in place; delete the key itself when it becomes empty. */
export function pruneEnvFields(env: Record<string, string>, keys: string[]): void {
  for (const key of keys) {
    delete env[key];
  }
}