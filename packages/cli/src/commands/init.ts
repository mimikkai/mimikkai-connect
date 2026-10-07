/**
 * Init wizard for mimikkai-connect (pattern from @z_ai/coding-helper wizard.js).
 * Steps: language → tool selection → tool-action menu (configure / unbind /
 * bind another account) → [auth] → foreign-overwrite guard → config load → summary.
 */

import inquirer from "inquirer";
import chalk from "chalk";
import { configManager } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { obfuscate } from "../utils/obfuscate.ts";
import { printLogo } from "../utils/logo.ts";
import { SUPPORTED_LANGS, t } from "../i18n.ts";
import { runInteractiveAuth } from "./auth.ts";
import { detectForeignProvider, defaultConfirmOverwrite, promptToolAction } from "./toolConfig.ts";
import { claudeCodeManager } from "../agents/claudeCode.ts";
import { codexManager } from "../agents/codex.ts";
import type { AgentManager } from "../agents/base.ts";

const AGENTS: AgentManager[] = [claudeCodeManager, codexManager];

/** Display names in the language itself (native script). */
const LANG_NAMES: Record<string, string> = {
  ru_RU: "Русский",
  en_US: "English",
};

/** Build the tool-choice label: MimikkAi configuration status only. */
export function toolChoiceLabel(agent: AgentManager): string {
  const bound = agent.detectCurrentConfig().plan === "mimikkai"
    ? t("init.toolMimikkaiBound")
    : t("init.toolMimikkaiUnbound");
  return `${agent.displayName} (${bound})`;
}

/** Print the end-of-run summary; key is obfuscated, plan falls back to MimikkAi. */
function printSummary(tool: string): void {
  const key = configManager.getLitellmKey();
  console.log(t("init.summary", {
    lang: configManager.getLang(),
    email: configManager.getApiKey() ? "authenticated" : "-",
    key: key ? obfuscate(key) : "-",
    plan: configManager.getPlan() ?? "mimikkai",
    tool,
  }));
}

export async function runInit(): Promise<void> {
  printLogo();
  console.log(chalk.cyan(t("init.welcome")));

  // 1. Language
  const { lang } = await inquirer.prompt([
    {
      type: "list",
      name: "lang",
      message: t("init.selectLanguage"),
      // ru_RU first — the default
      choices: SUPPORTED_LANGS.map((code) => ({
        name: LANG_NAMES[code] ?? code,
        value: code,
      })),
      default: "ru_RU",
    },
  ]);
  configManager.setLang(lang);

  // 2. Tool selection (installed tools first) — before auth so the user picks
  //    what to configure even when already signed in
  const sorted = [...AGENTS].sort((a, b) => Number(b.isInstalled()) - Number(a.isInstalled()));
  const { toolId } = await inquirer.prompt([
    {
      type: "list",
      name: "toolId",
      message: t("init.selectTool"),
      choices: sorted.map((agent) => ({
        name: toolChoiceLabel(agent),
        value: agent.id,
      })),
    },
  ]);
  logger.debug("init", "reordered flow: tool selected before auth");

  const agent = AGENTS.find((a) => a.id === toolId)!;

  // 3. Unified tool-action menu: always shown, before any auth.
  const action = await promptToolAction(agent);
  logger.debug("init", "unified tool-action menu");

  if (action === "keep") {
    // Nothing to unbind — leave the tool untouched, just show the summary.
    printSummary(agent.displayName);
    return;
  }

  if (action === "unbind") {
    // "Bind another account?" after unbind; yes → auth + reconfigure.
    const { rebind } = await inquirer.prompt([
      {
        type: "confirm",
        name: "rebind",
        message: t("init.unbindConfirmRebind"),
        default: false,
      },
    ]);
    if (!rebind) {
      // Tool config removed; the global key stays bound — make that explicit.
      console.log(chalk.yellow(t("init.unboundSummary", { tool: agent.displayName })));
      return;
    }
    console.log(chalk.cyan(t("init.authRequired")));
    const authOk = await runInteractiveAuth();
    if (!authOk) {
      console.log(chalk.red(t("init.cancelled")));
      process.exitCode = 1;
      return;
    }
  } else if (action === "rebind") {
    console.log(chalk.cyan(t("init.authRequired")));
    const authOk = await runInteractiveAuth();
    if (!authOk) {
      console.log(chalk.red(t("init.cancelled")));
      process.exitCode = 1;
      return;
    }
  } else if (!configManager.getLitellmKey()) {
    // proceed without a saved key → auth required
    console.log(chalk.cyan(t("init.authRequired")));
    const authOk = await runInteractiveAuth();
    if (!authOk) {
      console.log(chalk.red(t("init.cancelled")));
      process.exitCode = 1;
      return;
    }
  }

  // Foreign provider is never overwritten without an explicit confirmation.
  if (detectForeignProvider(agent)) {
    logger.debug("init", `${agent.id}: foreign provider detected`);
    console.log(chalk.yellow(t("init.overwriteForeignAsk", { tool: agent.displayName })));
    const ok = await defaultConfirmOverwrite(t("init.overwriteConfirm", { tool: agent.displayName }));
    if (!ok) {
      console.log(chalk.red(t("init.overwriteCancelled", { tool: agent.displayName })));
      printSummary(agent.displayName);
      return;
    }
  }

  const finalKey = configManager.getLitellmKey();
  if (!finalKey) {
    console.error(chalk.red(t("auth.litellmKeyMissing")));
    process.exitCode = 1;
    return;
  }
  console.log(chalk.cyan(t("init.configuring", { tool: agent.displayName })));

  const model = agent.defaultModel;
  await agent.loadConfig(configManager.getPlan() ?? "mimikkai", finalKey, model);
  if (!agent.isInstalled()) {
    logger.warn("init", `${agent.id}: configuration written but tool is not installed`);
    console.log(chalk.yellow(t("init.toolNotInstalledWarn", { tool: agent.displayName })));
  }

  // 4. Summary
  console.log(chalk.green(t("init.configured", { tool: agent.displayName, model })));
  printSummary(agent.displayName);
}