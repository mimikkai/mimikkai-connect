/**
 * i18n for mimikkai-connect.
 *
 * Dictionaries live in `locales/<lang>.json` and are copied to
 * `dist/locales` by the build script. The active language comes from
 * the config (`lang`, default ru_RU), with en_US as fallback.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configManager } from "./config.ts";
import { logger } from "./utils/logger.ts";

export const SUPPORTED_LANGS = ["ru_RU", "en_US"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export const DEFAULT_LANG: Lang = "ru_RU";

type Dictionary = Record<string, unknown>;

const dictionaries: Record<string, Dictionary> = {};

/** Resolve the locales dir both in dev (src/../locales) and in the built bundle (dist/locales). */
function localesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, "locales"), join(here, "..", "locales"), join(here, "..", "..", "locales")]) {
    if (existsSync(candidate)) return candidate;
  }
  return join(here, "..", "..", "locales");
}

function loadDictionary(lang: string): Dictionary {
  const cached = dictionaries[lang];
  if (cached) return cached;
  const path = join(localesDir(), `${lang}.json`);
  try {
    if (existsSync(path)) {
      const dict = JSON.parse(readFileSync(path, "utf-8")) as Dictionary;
      dictionaries[lang] = dict;
      logger.debug("i18n", `loaded locale ${lang} from ${path}`);
      return dict;
    }
  } catch (error) {
    logger.warn("i18n", `failed to load locale ${lang}: ${error}`);
  }
  logger.warn("i18n", `locale file not found: ${path}`);
  return {};
}

function lookup(dict: Dictionary, key: string): string | undefined {
  const value = key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, params?: Record<string, string>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => params[name] ?? `{{${name}}}`);
}

/** Translate `key` in the active language, falling back to en_US, then to the raw key. */
export function t(key: string, params?: Record<string, string>): string {
  const lang = configManager.getLang();
  const value = lookup(loadDictionary(lang), key) ?? lookup(loadDictionary("en_US"), key);
  if (value === undefined) {
    logger.warn("i18n", `missing translation key: ${key}`);
    return key;
  }
  return interpolate(value, params);
}

export function isSupportedLang(lang: string): lang is Lang {
  return (SUPPORTED_LANGS as readonly string[]).includes(lang);
}