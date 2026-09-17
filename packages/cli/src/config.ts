/**
 * Config manager for mimikkai-connect.
 *
 * Config lives at ~/.mimikkai-connect/config.yaml (pattern borrowed from
 * @z_ai/coding-helper's ~/.chelper/config.yaml).
 *
 * Stored fields:
 *  - lang: UI language ("ru_RU" default, "en_US")
 *  - plan: reserved plan alias (glm_coding_plan_global | glm_coding_plan_china)
 *  - api_key: mimikkai API token (validated via GraphQL)
 *  - litellm_key: LiteLLM virtual key (sk-...) written into agent configs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { logger } from "./utils/logger.ts";

export interface MimikkaiCliConfig {
  lang?: string;
  plan?: string;
  api_key?: string;
  litellm_key?: string;
}

const DEFAULTS: MimikkaiCliConfig = { lang: "ru_RU" };

class ConfigManager {
  readonly configDir: string;
  readonly configPath: string;
  private config: MimikkaiCliConfig;

  constructor() {
    this.configDir = join(homedir(), ".mimikkai-connect");
    this.configPath = join(this.configDir, "config.yaml");
    this.config = this.loadConfig();
  }

  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
      logger.debug("config", `created config dir ${this.configDir}`);
    }
  }

  private loadConfig(): MimikkaiCliConfig {
    if (!existsSync(this.configPath)) {
      logger.debug("config", `no config at ${this.configPath}, using defaults`);
      return { ...DEFAULTS };
    }
    try {
      const content = readFileSync(this.configPath, "utf-8");
      const parsed = yaml.load(content) as MimikkaiCliConfig | null;
      return parsed ?? { ...DEFAULTS };
    } catch (error) {
      logger.warn("config", `failed to load config, using defaults: ${error}`);
      return { ...DEFAULTS };
    }
  }

  saveConfig(config: MimikkaiCliConfig = this.config): void {
    try {
      this.ensureConfigDir();
      writeFileSync(this.configPath, yaml.dump(config), "utf-8");
      this.config = config;
      logger.debug("config", `saved config to ${this.configPath}`);
    } catch (error) {
      logger.error("config", `failed to save config: ${error}`);
      throw error;
    }
  }

  getConfig(): MimikkaiCliConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<MimikkaiCliConfig>): void {
    this.saveConfig({ ...this.config, ...updates });
  }

  isFirstRun(): boolean {
    return !existsSync(this.configPath);
  }

  getLang(): string {
    return this.config.lang ?? "ru_RU";
  }

  setLang(lang: string): void {
    this.updateConfig({ lang });
  }

  getPlan(): string | undefined {
    return this.config.plan;
  }

  setPlan(plan: string): void {
    this.updateConfig({ plan });
  }

  getApiKey(): string | undefined {
    return this.config.api_key;
  }

  setApiKey(apiKey: string): void {
    this.updateConfig({ api_key: apiKey });
  }

  getLitellmKey(): string | undefined {
    return this.config.litellm_key;
  }

  setLitellmKey(key: string): void {
    this.updateConfig({ litellm_key: key });
  }

  /** Remove auth-related fields (api_key, litellm_key, plan). */
  revokeAuth(): void {
    this.saveConfig({ lang: this.getLang() });
  }
}

export const configManager = new ConfigManager();