/**
 * Init wizard for mimikkai-connect (pattern from @z_ai/coding-helper wizard.js).
 * Steps: language → auth (device flow) → tool selection → config load → summary.
 */

import inquirer from "inquirer";
import chalk from "chalk";
import { configManager } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { SUPPORTED_LANGS, t } from "../i18n.ts";
import { runInteractiveAuth } from "./auth.ts";
import { resolveExistingToolConfig } from "./toolConfig.ts";
import { claudeCodeManager } from "../agents/claudeCode.ts";
import { codexManager } from "../agents/codex.ts";
import type { AgentManager } from "../agents/base.ts";

const AGENTS: AgentManager[] = [claudeCodeManager, codexManager];

export async function runInit(): Promise<void> {
  console.log(chalk.cyan(t("init.welcome")));

  // 1. Language
  const { lang } = await inquirer.prompt([
    {
      type: "list",
      name: "lang",
      message: t("init.selectLanguage"),
      // ru_RU first — the default
      choices: SUPPORTED_LANGS.map((code) => ({ name: code, value: code })),
      default: "ru_RU",
    },
  ]);
  configManager.setLang(lang);

  // 2. Auth
  console.log(chalk.cyan(t("init.authRequired")));
  const authOk = await runInteractiveAuth();
  if (!authOk) {
    console.log(chalk.red(t("init.cancelled")));
    process.exitCode = 1;
    return;
  }

  // 3. Tool selection (installed tools first)
  const sorted = [...AGENTS].sort((a, b) => Number(b.isInstalled()) - Number(a.isInstalled()));
  const { toolId } = await inquirer.prompt([
    {
      type: "list",
      name: "toolId",
      message: t("init.selectTool"),
      choices: sorted.map((agent) => ({
        name: `${agent.displayName} (${agent.isInstalled() ? t("init.toolInstalled") : t("init.toolNotInstalled")})`,
        value: agent.id,
      })),
    },
  ]);

  const agent = AGENTS.find((a) => a.id === toolId)!;

  // Resolve what to do if the tool already has a mimikkai/foreign configuration
  const resolution = await resolveExistingToolConfig(agent, {
    getLitellmKey: () => configManager.getLitellmKey(),
  });
  logger.debug("init", `tool ${agent.id} resolution: ${resolution}`);

  const litellmKey = configManager.getLitellmKey();
  if (resolution === "keep") {
    // Leave the existing configuration untouched, just show the summary
    console.log(t("init.summary", {
      lang: configManager.getLang(),
      email: configManager.getApiKey() ? "authenticated" : "-",
      plan: configManager.getPlan() ?? "mimikkai",
      tool: agent.displayName,
    }));
    return;
  }

  if (resolution === "unbind") {
    console.log(t("init.summary", {
      lang: configManager.getLang(),
      email: configManager.getApiKey() ? "authenticated" : "-",
      plan: configManager.getPlan() ?? "mimikkai",
      tool: agent.displayName,
    }));
    return;
  }

  if (resolution === "reauthorise") {
    console.log(chalk.cyan(t("init.authRequired")));
    const authOk = await runInteractiveAuth();
    if (!authOk) {
      console.log(chalk.red(t("init.cancelled")));
      process.exitCode = 1;
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

  // 4. Summary
  console.log(chalk.green(t("init.configured", { tool: agent.displayName, model })));
  console.log(
    t("init.summary", {
      lang: configManager.getLang(),
      email: configManager.getApiKey() ? "authenticated" : "-",
      plan: configManager.getPlan() ?? "mimikkai",
      tool: agent.displayName,
    })
  );
}