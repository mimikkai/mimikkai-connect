#!/usr/bin/env bun
/**
 * mimikkai-connect CLI entrypoint.
 * Commands: -h/--help, -v/--version, init, lang, auth, doctor.
 */

import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { logger, setLogLevel } from "./utils/logger.ts";
import { t } from "./i18n.ts";
import { runInit } from "./commands/init.ts";
import { printLangHelp, setLang, showLang } from "./commands/lang.ts";
import { PLAN_ALIASES, reloadTool, revokeAuth, runInteractiveAuth, setKeyWithPlan } from "./commands/auth.ts";
import { runDoctor } from "./commands/doctor.ts";

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf-8")
) as { version: string };

const program = new Command();

program
  .name("mimikkai-connect")
  .description(t("cli.description"))
  .version(pkg.version, "-v, --version", "output the version number")
  .helpOption("-h, --help", "display help")
  .option("--verbose", t("cli.verboseHint"), false)
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().verbose) setLogLevel("debug");
    logger.debug("cli", `command: ${thisCommand.args.join(" ") || "(default)"}`);
  });

program
  .command("init")
  .description("Run the initialization wizard")
  .action(async () => {
    await runInit();
  });

const lang = program.command("lang").description("Language management");
lang
  .command("show")
  .description("Display the current language")
  .action(() => {
    showLang();
  });
lang
  .command("set <code>")
  .description("Switch language (en_US, ru_RU)")
  .action((code: string) => {
    setLang(code);
  });
lang.action(() => {
  // bare `lang` → show current
  showLang();
});
lang.helpOption("-h, --help", "Show help for language commands");
lang.addHelpText("after", `\n${t("lang.help")}`);

const auth = program.command("auth").description("API key management").helpOption("-h, --help", "Show help for auth commands");
auth.addHelpText("after", `\n${t("auth.help")}`);
auth
  .command("revoke")
  .description("Delete the saved key")
  .action(async () => {
    await revokeAuth();
  });
auth
  .command("reload <tool>")
  .description("Load the latest plan info into a coding tool (e.g. claude)")
  .action(async (tool: string) => {
    await reloadTool(tool);
  });
// `auth <plan> <token>` — direct key setup with a plan alias
for (const plan of PLAN_ALIASES) {
  auth
    .command(`${plan} <token>`)
    .description("Choose this plan and set the key directly")
    .action(async (token: string) => {
      await setKeyWithPlan(plan, token);
    });
}
// bare `auth` → interactive
auth.action(async () => {
  await runInteractiveAuth();
});

program
  .command("doctor")
  .description("Inspect system configuration and tool status")
  .action(async () => {
    await runDoctor();
  });

program.parseAsync(process.argv).catch((error) => {
  logger.error("cli", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});