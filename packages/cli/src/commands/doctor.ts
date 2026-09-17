/**
 * Doctor command — inspect system configuration and tool status.
 * Pattern from @z_ai/coding-helper commands/doctor.js.
 */

import chalk from "chalk";
import { configManager } from "../config.ts";
import { t } from "../i18n.ts";
import { DEFAULT_AUTH_CONFIG } from "../auth/types.ts";
import { validateToken } from "../auth/validateToken.ts";
import { claudeCodeManager } from "../agents/claudeCode.ts";
import { codexManager } from "../agents/codex.ts";
import type { AgentManager } from "../agents/base.ts";
import { logger } from "../utils/logger.ts";
import { obfuscate } from "../utils/obfuscate.ts";

const AGENTS: AgentManager[] = [claudeCodeManager, codexManager];

/** Print one doctor row: [STATUS] label — detail. */
function printRow(status: "ok" | "warn" | "fail", label: string, detail = ""): void {
  const tag = status === "ok" ? chalk.green(t("doctor.ok")) : status === "warn" ? chalk.yellow(t("doctor.warn")) : chalk.red(t("doctor.fail"));
  const pad = " ".repeat(Math.max(0, 10 - t("doctor.ok").length));
  console.log(`  [${tag}]${pad}${label}${detail ? ` — ${detail}` : ""}`);
}

export async function runDoctor(): Promise<void> {
  console.log(chalk.bold(t("doctor.title")));
  console.log();
  let failures = 0;

  // 1. Config file
  const configExists = !configManager.isFirstRun();
  printRow(configExists ? "ok" : "fail", t("doctor.configExists"));
  if (!configExists) failures++;

  // 2. API key present
  const apiKey = configManager.getApiKey();
  printRow(apiKey ? "ok" : "warn", t("doctor.keyPresent"), apiKey ? obfuscate(apiKey) : "");

  // 3. Key valid (network round-trip)
  if (apiKey) {
    try {
      const validation = await validateToken(DEFAULT_AUTH_CONFIG, apiKey);
      printRow(validation.valid ? "ok" : "fail", t("doctor.keyValid"));
      if (!validation.valid) failures++;
    } catch (error) {
      printRow("warn", t("doctor.keyValid"), error instanceof Error ? error.message : String(error));
    }
  } else {
    console.log(chalk.dim(`  ${t("doctor.hintAuth")}`));
  }

  console.log();

  // 4. Tools
  for (const agent of AGENTS) {
    logger.debug("doctor", `checking tool ${agent.id}`);
    printRow(agent.isInstalled() ? "ok" : "warn", t("doctor.toolInstalled", { tool: agent.displayName }));
    const detected = agent.detectCurrentConfig();
    const configured = detected.plan === "mimikkai" && Boolean(detected.apiKey);
    printRow(
      configured ? "ok" : "warn",
      t("doctor.toolConfigured", { tool: agent.displayName }),
      detected.apiKey ? obfuscate(detected.apiKey) : ""
    );
    if (!configured) failures++;
    console.log();
  }

  process.exitCode = failures > 0 ? 1 : 0;
}