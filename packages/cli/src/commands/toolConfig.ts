/**
 * Interactive tool-action menu for the init wizard.
 *
 * Shown unconditionally after the user picks claude or codex, regardless of
 * the tool's current configuration state:
 * - configure the tool for mimikkai (proceed);
 * - remove the mimikkai configuration (unbind; caller may then re-bind);
 * - bind another mimikkai account (rebind) without touching other tools' configs.
 */

import { existsSync, readFileSync } from "node:fs";
import * as TOML from "smol-toml";
import inquirer from "inquirer";
import chalk from "chalk";

/** Force an ASCII pointer glyph in inquirer list prompts.
 * inquirer@9 hardcodes `figures.pointer` ("❯", U+276F) at render time;
 * on terminals that are not true UTF-8 (legacy Windows codepages) that glyph
 * garbles the whole line ("❯ Русский" -> "â¯ Ð ÑÑÐºÐ¸Ð¹"). The
 * @inquirer/figures default export is mutable, so replacing it with ">"
 * makes the interactive menu codepage-safe. */
import figures from "@inquirer/figures";

import { t } from "../i18n.ts";
import { logger } from "../utils/logger.ts";
import type { AgentManager } from "../agents/base.ts";
import { LITELLM_BASE_URL } from "../agents/claudeCode.ts";

export type ToolAction = "proceed" | "unbind" | "rebind" | "keep";

export interface ToolActionDeps {
  /** Confirm prompt (injectable for tests); resolves to true when the user agrees. */
  confirm?(message: string): Promise<boolean>;
}

interface CodexForeignProbe {
  model_provider?: unknown;
}

interface ClaudeForeignProbe {
  env?: { ANTHROPIC_BASE_URL?: string } | null;
}

/** Overwrite the mutable figures default export once per process. */
export function useAsciiPointer(): void {
  const mutable = figures as { pointer?: string };
  if (typeof mutable.pointer === "string") {
    mutable.pointer = ">";
    logger.debug("agents", "inquirer pointer glyph set to ASCII '>'");
  }
}

/** Codex config.toml stores a provider key; claude settings.json stores env vars. */
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
 * Show the tool-action menu and run the branch-local side effect for unbind.
 *
 * Returns:
 *  - "proceed" — caller continues normal setup (auth when no key yet, then
 *    foreign-overwrite guard, then loadConfig);
 *  - "unbind" — mimikkai configuration was removed;
 *    caller asks "bind another account?" only after an actual removal;
 *  - "keep" — nothing to unbind; caller shows the summary and stops;
 *  - "rebind" — caller runs interactive re-auth and reconfigures.
 */
export async function promptToolAction(
  agent: AgentManager,
  deps: ToolActionDeps = {},
): Promise<ToolAction> {
  const detected = agent.detectCurrentConfig();
  const isMimikkai = detected.plan === "mimikkai" && Boolean(detected.apiKey);
  logger.debug("init", `${agent.id}: tool-action menu (mimikkaiConfig=${isMimikkai})`);

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: t("init.actionPrompt", { tool: agent.displayName }),
      choices: [
        { name: t("init.actionConfigure", { tool: agent.displayName }), value: "proceed" },
        { name: t("init.actionUnbind", { tool: agent.displayName }), value: "unbind" },
        { name: t("init.actionRebind"), value: "rebind" },
      ],
    },
  ]);
  logger.debug("init", `${agent.id}: tool action=${action}`);

  if (action === "unbind") {
    if (!isMimikkai) {
      console.log(chalk.yellow(t("init.unbindNothing", { tool: agent.displayName })));
      // Nothing was removed — no "bind another account?" and no reconfiguration.
      return "keep";
    }
    await agent.unloadConfig();
    console.log(chalk.green(t("init.unbound", { tool: agent.displayName })));
    return "unbind";
  }

  return action;
}