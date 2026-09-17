/**
 * Claude Code agent manager.
 * Pattern borrowed from @z_ai/coding-helper's claude-code-manager.js,
 * adapted for mimikkai: LiteLLM proxy as the Anthropic-compatible endpoint.
 *
 * Files touched:
 *  - ~/.claude/settings.json — env block
 *  - ~/.claude.json          — hasCompletedOnboarding flag
 */

import { existsSync } from "node:fs";
import { obfuscate } from "../utils/obfuscate.ts";
import { logger } from "../utils/logger.ts";
import {
  type AgentDetectResult,
  type AgentManager,
  ensureDirFor,
  homePath,
  pruneEnvFields,
  readJsonFile,
  writeJsonFile,
} from "./base.ts";

/** Base URL of the MimikkAi LiteLLM proxy (Anthropic-compatible entrypoint). */
export const LITELLM_BASE_URL = "https://litellm.mimikkai.ru";

/** env fields owned by mimikkai-connect in ~/.claude/settings.json. */
const OWNED_ENV_KEYS = [
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "API_TIMEOUT_MS",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
] as const;

interface ClaudeSettings {
  env?: Record<string, string>;
  [key: string]: unknown;
}

interface ClaudeRootConfig {
  hasCompletedOnboarding?: boolean;
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

export const claudeCodeManager: AgentManager = {
  id: "claude",
  displayName: "Claude Code",
  installMarkerDir: homePath(".claude"),
  defaultModel: "glm-5.3-flash",

  isInstalled(): boolean {
    return existsSync(this.installMarkerDir);
  },

  async loadConfig(plan: string, litellmKey: string, model?: string): Promise<void> {
    const selected = model ?? this.defaultModel;
    const settingsPath = homePath(".claude", "settings.json");
    const rootConfigPath = homePath(".claude.json");

    logger.debug("claude", `loading config: plan=${plan} model=${selected} key=${obfuscate(litellmKey)}`);

    // 1. settings.json — merge our env block, preserve everything else
    const settings = readJsonFile<ClaudeSettings>(settingsPath);
    const cleanedEnv = { ...(settings.env ?? {}) };
    pruneEnvFields(cleanedEnv, ["ANTHROPIC_API_KEY"]);
    settings.env = {
      ...cleanedEnv,
      ANTHROPIC_AUTH_TOKEN: litellmKey,
      ANTHROPIC_BASE_URL: LITELLM_BASE_URL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: selected,
      ANTHROPIC_DEFAULT_SONNET_MODEL: selected,
      ANTHROPIC_DEFAULT_OPUS_MODEL: selected,
      API_TIMEOUT_MS: "3000000",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    };
    ensureDirFor(settingsPath);
    writeJsonFile(settingsPath, settings);

    // 2. ~/.claude.json — ensure onboarding completed
    const rootConfig = readJsonFile<ClaudeRootConfig>(rootConfigPath);
    if (!rootConfig.hasCompletedOnboarding) {
      rootConfig.hasCompletedOnboarding = true;
      writeJsonFile(rootConfigPath, rootConfig);
    }
  },

  async unloadConfig(): Promise<void> {
    const settingsPath = homePath(".claude", "settings.json");
    const settings = readJsonFile<ClaudeSettings>(settingsPath);
    if (!settings.env) return;

    const env = { ...settings.env };
    pruneEnvFields(env, [...OWNED_ENV_KEYS, "ANTHROPIC_API_KEY"]);
    if (Object.keys(env).length === 0) {
      delete settings.env;
    } else {
      settings.env = env;
    }
    writeJsonFile(settingsPath, settings);
  },

  detectCurrentConfig(): AgentDetectResult {
    const settings = readJsonFile<ClaudeSettings>(homePath(".claude", "settings.json"));
    const apiKey = settings.env?.ANTHROPIC_AUTH_TOKEN ?? null;
    const plan = settings.env?.ANTHROPIC_BASE_URL === LITELLM_BASE_URL ? "mimikkai" : null;
    return { plan, apiKey };
  },
};