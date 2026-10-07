/**
 * Interactive resolution of an already-configured coding tool.
 *
 * Used by `init` (and reusable by `auth reload <tool>`):
 * - already bound to mimikkai → keep / unbind / re-bind another account;
 * - bound to a different provider → confirm before overwriting;
 * - not configured → proceed with normal setup.
 */

import { existsSync, readFileSync } from "node:fs";
import * as TOML from "smol-toml";
import inquirer from "inquirer";
import chalk from "chalk";
import { t } from "../i18n.ts";
import { logger } from "../utils/logger.ts";
import type { AgentManager } from "../agents/base.ts";
import { LITELLM_BASE_URL } from "../agents/claudeCode.ts";

export type ToolConfigResolution = "proceed" | "keep" | "unbind" | "reauthorise";

export interface ResolveDeps {
  getLitellmKey: () => string | undefined;
  /** Confirm prompt (injectable for tests); resolves to true when the user agrees. */
  confirm?(message: string): Promise<boolean>;
}

interface CodexForeignProbe {
  model_provider?: unknown;
}

interface ClaudeForeignProbe {
  env?: { ANTHROPIC_BASE_URL?: string } | null;
}

/** Exported detection helper (also used by `auth reload <tool>`). */
export function detectForeignProvider(agent: AgentManager): boolean {
  if (agent.id === "codex") {
    const path = `${agent.installMarkerDir}/config.toml`;
    if (!existsSync(path)) return false;
    try {
      const parsed = TOML.parse(readFileSync(path, "utf-8")) as CodexForeignProbe;
      const provider = parsed.model_provider;
      return typeof provider === "string" && provider !== "MIMIKKAI";
    } catch (error) {
      logger.debug("init", `codex foreign-provider probe failed: ${error}`);
      return false;
    }
  }

  if (agent.id === "claude") {
    const path = `${agent.installMarkerDir}/settings.json`;
    if (!existsSync(path)) return false;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as ClaudeForeignProbe;
      const base = parsed.env?.ANTHROPIC_BASE_URL;
      // Not configured at all → nothing foreign; configured to a different
      // Anthropic-compatible endpoint → foreign provider.
      return Boolean(base) && base !== LITELLM_BASE_URL;
    } catch (error) {
      logger.debug("init", `claude foreign-provider probe failed: ${error}`);
      return false;
    }
  }

  return false;
}

/** Exported confirm prompt (also used by `auth reload <tool>`). */
export async function defaultConfirmOverwrite(message: string): Promise<boolean> {
  const { ok } = await inquirer.prompt([
    {
      type: "confirm",
      name: "ok",
      message,
      default: false,
    },
  ]);
  return Boolean(ok);
}

/**
 * Interactively resolve what to do with an already-configured tool.
 *
 * Returns:
 *  - "proceed" — continue normal setup (not bound, or user confirmed overwrite,
 *    or was unbound and asked to configure again);
 *  - "keep" — leave the existing configuration untouched;
 *  - "unbind" — user asked to unbind; `agent.unloadConfig()` was already called,
 *    caller should skip configuration;
 *  - "reauthorise" — user wants to bind another account; caller re-runs auth.
 */
export async function resolveExistingToolConfig(
  agent: AgentManager,
  deps: ResolveDeps,
): Promise<ToolConfigResolution> {
  const detected = agent.detectCurrentConfig();
  const isMimikkai = detected.plan === "mimikkai" && Boolean(detected.apiKey);

  if (isMimikkai) {
    const sameKey = detected.apiKey === deps.getLitellmKey();
    logger.debug("init", `${agent.id}: already configured by mimikkai (key=${sameKey ? "current" : "other"})`);
    if (sameKey) {
      console.log(chalk.yellow(t("init.alreadyConfigured", { tool: agent.displayName })));
    } else {
      console.log(chalk.yellow(t("init.alreadyConfiguredOtherKey", { tool: agent.displayName })));
    }
    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: t("init.rebindPrompt"),
        choices: [
          { name: t("init.rebindKeep"), value: "keep" },
          { name: t("init.rebindUnbind"), value: "unbind" },
          { name: t("init.rebindRebind"), value: "rebind" },
        ],
      },
    ]);
    logger.debug("init", `${agent.id}: rebind action=${action}`);

    if (action === "keep") return "keep";

    if (action === "unbind") {
      await agent.unloadConfig();
      console.log(chalk.green(t("init.unbound", { tool: agent.displayName })));
      const confirm = deps.confirm ?? defaultConfirmOverwrite;
      const again = await confirm(t("init.configureAgainPrompt"));
      return again ? "proceed" : "unbind";
    }

    return "reauthorise";
  }

  const foreign = detectForeignProvider(agent);
  if (foreign) {
    logger.debug("init", `${agent.id}: foreign provider detected`);
    console.log(chalk.yellow(t("init.overwriteForeignAsk", { tool: agent.displayName })));
    const confirm = deps.confirm ?? defaultConfirmOverwrite;
    const ok = await confirm(t("init.overwriteConfirm"));
    if (!ok) {
      console.log(chalk.red(t("init.overwriteCancelled", { tool: agent.displayName })));
      return "keep";
    }
  }

  return "proceed";
}