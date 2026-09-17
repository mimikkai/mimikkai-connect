/**
 * Language management command (`lang show | lang set <code>`).
 */

import { configManager } from "../config.ts";
import { isSupportedLang, SUPPORTED_LANGS, t } from "../i18n.ts";
import chalk from "chalk";

/** `lang show` — display the current language. */
export function showLang(): void {
  console.log(t("lang.current", { lang: configManager.getLang() }));
}

/** `lang set <code>` — validate and persist the language. */
export function setLang(code: string): void {
  if (!isSupportedLang(code)) {
    console.error(chalk.red(t("lang.invalid", { lang: code, supported: SUPPORTED_LANGS.join(", ") })));
    process.exitCode = 1;
    return;
  }
  configManager.setLang(code);
  console.log(chalk.green(t("lang.set", { lang: code })));
}

/** `lang --help` — dedicated help text. */
export function printLangHelp(): void {
  console.log(t("lang.help"));
}