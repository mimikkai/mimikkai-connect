/**
 * Verbose logger for mimikkai-connect CLI.
 *
 * Levels: DEBUG < INFO < WARN < ERROR.
 * Default level: WARN (quiet). `MIMIKKAI_LOG_LEVEL` env or the CLI `--verbose`
 * flag raises it (DEBUG enables verbose flow tracing).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let currentLevel: LogLevel = parseEnvLevel();

function parseEnvLevel(): LogLevel {
  const raw = process.env.MIMIKKAI_LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "warn";
}

function enabled(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

/** Set the active log level (used by the `--verbose` CLI flag). */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
  logger.debug("logger", `log level set to ${level}`);
}

function emit(level: Exclude<LogLevel, "debug">, module: string, message: string): void {
  const prefix = `[mimikkai-connect.${module}]`;
  const line = `${prefix} ${message}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** On Windows the console may use a legacy codepage (cp1251/cp850), which
 * garbles Unicode output ("Русский" -> "Ð ÑÑÐºÐ¸Ð¹"). Switch the codepage
 * to 65001 (UTF-8) once per process — no-op on failure or other platforms.
 */
export function normalizeWindowsCodepage(): void {
  if (process.platform !== "win32") return;
  try {
    Bun.spawnSync(["cmd", "/d", "/c", "chcp", "65001"], { stdout: "ignore", stderr: "ignore" });
    logger.debug("cli", "windows codepage set to 65001 (UTF-8)");
  } catch (error) {
    logger.debug("cli", `failed to set windows codepage: ${error}`);
  }
}

export const logger = {
  debug(module: string, message: string): void {
    if (enabled("debug")) console.log(`[mimikkai-connect.${module}] [DEBUG] ${message}`);
  },
  info(module: string, message: string): void {
    if (enabled("info")) emit("info", module, message);
  },
  warn(module: string, message: string): void {
    if (enabled("warn")) emit("warn", module, message);
  },
  error(module: string, message: string): void {
    if (enabled("error")) emit("error", module, message);
  },
};