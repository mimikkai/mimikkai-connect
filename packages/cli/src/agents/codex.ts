/**
 * Codex agent manager.
 * Pattern borrowed from @z_ai/coding-helper's codex-manager.js,
 * adapted for mimikkai: LiteLLM OpenAI-compatible proxy.
 *
 * Files touched:
 *  - ~/.codex/config.toml — model_provider, model, model_providers.MIMIKKAI
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as TOML from "smol-toml";
import { obfuscate } from "../utils/obfuscate.ts";
import { logger } from "../utils/logger.ts";
import {
  type AgentDetectResult,
  type AgentManager,
  ensureDirFor,
  homePath,
} from "./base.ts";
import { LITELLM_BASE_URL } from "./claudeCode.ts";

/** Provider key written into Codex config.toml. */
const PROVIDER_KEY = "MIMIKKAI";

/** LiteLLM OpenAI-compatible endpoint (chat completions). */
const LITELLM_OPENAI_BASE_URL = `${LITELLM_BASE_URL}/v1`;

const CONFIG_PATH = homePath(".codex", "config.toml");

interface CodexProvider {
  name: string;
  base_url: string;
  experimental_bearer_token?: string;
  wire_api: string;
}

interface CodexConfig {
  model_provider?: string;
  model?: string;
  model_providers?: Record<string, CodexProvider>;
  [key: string]: unknown;
}

function readCodexConfig(): CodexConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return TOML.parse(readFileSync(CONFIG_PATH, "utf-8")) as CodexConfig;
  } catch (error) {
    logger.warn("codex", `failed to read ${CONFIG_PATH}: ${error}`);
    return {};
  }
}

function writeCodexConfig(config: CodexConfig): void {
  ensureDirFor(CONFIG_PATH);
  writeFileSync(CONFIG_PATH, TOML.stringify(config as unknown as Record<string, unknown>), "utf-8");
  logger.info("codex", `saved ${CONFIG_PATH}`);
}

export const codexManager: AgentManager = {
  id: "codex",
  displayName: "Codex",
  installMarkerDir: homePath(".codex"),
  defaultModel: "glm-5.3-flash",

  isInstalled(): boolean {
    return existsSync(this.installMarkerDir);
  },

  async loadConfig(plan: string, litellmKey: string, model?: string): Promise<void> {
    const selected = model ?? this.defaultModel;
    logger.debug("codex", `loading config: plan=${plan} model=${selected} key=${obfuscate(litellmKey)}`);

    const config = readCodexConfig();
    config.model_provider = PROVIDER_KEY;
    config.model = selected;
    config.model_providers = {
      ...(config.model_providers ?? {}),
      [PROVIDER_KEY]: {
        name: PROVIDER_KEY,
        base_url: LITELLM_OPENAI_BASE_URL,
        experimental_bearer_token: litellmKey,
        // Codex >=0.154 dropped Chat Completions support; LiteLLM also serves the Responses API.
        wire_api: "responses",
      },
    };
    writeCodexConfig(config);
  },

  async unloadConfig(): Promise<void> {
    const config = readCodexConfig();
    if (config.model_provider === PROVIDER_KEY) {
      delete config.model_provider;
    }
    if (config.model_providers) {
      delete config.model_providers[PROVIDER_KEY];
      if (Object.keys(config.model_providers).length === 0) {
        delete config.model_providers;
      }
    }
    writeCodexConfig(config);
  },

  detectCurrentConfig(): AgentDetectResult {
    const config = readCodexConfig();
    const provider = config.model_providers?.[PROVIDER_KEY];
    if (!provider) return { plan: null, apiKey: null };
    const plan = provider.base_url === LITELLM_OPENAI_BASE_URL ? "mimikkai" : null;
    return { plan, apiKey: provider.experimental_bearer_token ?? null };
  },
};