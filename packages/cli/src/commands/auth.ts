/**
 * Auth command implementation for mimikkai-connect.
 */

import { spawn } from "node:child_process";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { configManager } from "../config.ts";
import { t } from "../i18n.ts";
import { logger } from "../utils/logger.ts";
import { obfuscate } from "../utils/obfuscate.ts";
import { DEFAULT_AUTH_CONFIG } from "../auth/types.ts";
import {
  MimikkaiAuthExpiredError,
  MimikkaiAuthNetworkError,
  MimikkaiAuthUnexpectedError,
} from "../auth/errors.ts";
import { authorizeDevice, pollForToken } from "../auth/deviceAuth.ts";
import { validateToken } from "../auth/validateToken.ts";
import { fetchLitellmVirtualKey } from "../auth/litellmKey.ts";
import { claudeCodeManager } from "../agents/claudeCode.ts";
import { codexManager } from "../agents/codex.ts";
import type { AgentManager } from "../agents/base.ts";

/** Reserved plan aliases (both map to the single mimikkai LiteLLM endpoint). */
export const PLAN_ALIASES = ["glm_coding_plan_global", "glm_coding_plan_china"] as const;

const AGENTS: AgentManager[] = [claudeCodeManager, codexManager];

function openBrowser(url: string): void {
  logger.debug("auth", `opening browser: ${url}`);
  const platform = process.platform;
  const [cmd, args] =
    platform === "win32"
      ? (["cmd", ["/c", "start", "", url]] as const)
      : platform === "darwin"
        ? (["open", [url]] as const)
        : (["xdg-open", [url]] as const);
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.on("error", (error) => logger.warn("auth", `failed to open browser: ${error.message}`));
  child.unref();
}

/**
 * Full interactive device flow: authorize → open browser → poll → validate →
 * fetch LiteLLM key → persist to config. Returns true on success.
 */
export async function runInteractiveAuth(): Promise<boolean> {
  const config = DEFAULT_AUTH_CONFIG;

  console.log(chalk.cyan(t("auth.methodSelect")));
  const { method } = await inquirer.prompt([
    {
      type: "list",
      name: "method",
      message: t("auth.methodSelect"),
      choices: [
        { name: t("auth.methodDevice"), value: "device" },
        { name: t("auth.methodToken"), value: "token" },
      ],
    },
  ]);

  let token: string | undefined;
  let user: { id: number; name: string; email: string } | undefined;

  if (method === "device") {
    try {
      const device = await authorizeDevice(config);
      console.log(chalk.bold(t("auth.deviceCode", { code: device.user_code })));
      console.log(chalk.dim(t("auth.deviceOpen", { url: device.verification_uri_complete })));
      openBrowser(device.verification_uri_complete);

      const spinner = ora(t("auth.deviceWaiting")).start();
      const result = await pollForToken(config, device.device_code, {
        interval: device.interval,
        expiresIn: device.expires_in,
        onPending: () => {},
      });
      spinner.stop();
      token = result.token;
      user = result.user;
    } catch (error) {
      if (error instanceof MimikkaiAuthExpiredError) {
        console.error(chalk.red(t("auth.deviceExpired")));
      } else if (error instanceof MimikkaiAuthNetworkError) {
        console.error(chalk.red(t("auth.networkError", { message: error.message })));
      } else {
        console.error(chalk.red(t("auth.unexpectedError", { message: String(error) })));
      }
      return false;
    }
  } else {
    const { entered } = await inquirer.prompt([
      { type: "password", name: "entered", message: t("auth.tokenPrompt"), mask: "*" },
    ]);
    token = entered as string;
  }

  return await persistAuth(token!, user);
}

/**
 * Validate the token, fetch the LiteLLM key, and save everything to config.
 */
export async function persistAuth(token: string, user?: { id: number; name: string; email: string }): Promise<boolean> {
  const config = DEFAULT_AUTH_CONFIG;

  // Validate the token unless the device flow already returned user info
  if (!user) {
    const validation = await validateToken(config, token);
    if (!validation.valid) {
      console.error(chalk.red(t("auth.tokenInvalid")));
      return false;
    }
    user = validation.user;
    if (!user) {
      console.error(chalk.red(t("auth.tokenInvalid")));
      return false;
    }
    console.log(chalk.green(t("auth.tokenValid", { name: user.name, email: user.email })));
  }

  // LiteLLM virtual key — required to configure agents
  try {
    const key = await fetchLitellmVirtualKey(config, token);
    configManager.setLitellmKey(key.virtualKey);
    logger.info("auth", `litellm key saved: ${obfuscate(key.virtualKey)}`);
  } catch (error) {
    // Token is valid but no LiteLLM key — save the token anyway, warn loudly
    console.error(chalk.yellow(t("auth.litellmKeyMissing")));
    logger.error("auth", `litellm key fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  configManager.setApiKey(token);
  logger.info("auth", `auth saved: api_key=${obfuscate(token)} user=${user?.email ?? "unknown"}`);
  console.log(chalk.green(t("auth.saved")));
  return true;
}

/** `auth reload <tool>` — push saved keys into the tool's config. */
export async function reloadTool(toolId: string): Promise<void> {
  const agent = AGENTS.find((a) => a.id === toolId);
  if (!agent) {
    console.error(chalk.red(t("auth.reloadUnknownTool", { tool: toolId, supported: AGENTS.map((a) => a.id).join(", ") })));
    process.exitCode = 1;
    return;
  }

  const litellmKey = configManager.getLitellmKey();
  const apiKey = configManager.getApiKey();
  if (!apiKey) {
    console.error(chalk.red(t("auth.noKey")));
    process.exitCode = 1;
    return;
  }

  if (!litellmKey) {
    // Saved key but no LiteLLM key yet — try to fetch it now
    try {
      const key = await fetchLitellmVirtualKey(DEFAULT_AUTH_CONFIG, apiKey);
      configManager.setLitellmKey(key.virtualKey);
    } catch (error) {
      console.error(chalk.red(t("auth.litellmKeyMissing")));
      logger.error("auth", `litellm key fetch failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }
  }

  const model = agent.defaultModel;
  await agent.loadConfig(configManager.getPlan() ?? "mimikkai", configManager.getLitellmKey()!, model);
  console.log(chalk.green(t("auth.reloadDone", { tool: agent.displayName, model })));
}

/** `auth revoke` — clear saved keys and unload agent configs. */
export async function revokeAuth(): Promise<void> {
  for (const agent of AGENTS) {
    await agent.unloadConfig();
  }
  configManager.revokeAuth();
  logger.info("auth", "auth revoked, agent configs unloaded");
  console.log(chalk.green(t("auth.revoked")));
}

/** `auth <plan> <token>` — set key directly. Plans are aliases; both validate. */
export async function setKeyWithPlan(plan: string, token: string): Promise<void> {
  configManager.setPlan(plan);
  console.log(chalk.green(t("auth.planSet", { plan })));
  const ok = await persistAuth(token);
  if (!ok) process.exitCode = 1;
}