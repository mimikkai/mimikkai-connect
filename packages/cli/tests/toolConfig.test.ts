/**
 * Tests for commands/toolConfig.ts — resolution of an already-configured tool.
 * Deterministic: mock agent + injected confirm; no real user files or network.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import inquirer from "inquirer";
import type { AgentManager, AgentDetectResult } from "../src/agents/base.ts";
import {
  detectForeignProvider,
  resolveExistingToolConfig,
  type ResolveDeps,
  type ToolConfigResolution,
} from "../src/commands/toolConfig.ts";
import { LITELLM_BASE_URL } from "../src/agents/claudeCode.ts";

type MenuAction = "keep" | "unbind" | "rebind";

function makeMockAgent(overrides: Partial<AgentManager> & { detect?: AgentDetectResult; foreign?: boolean; id?: string }): AgentManager {
  const id = overrides.id ?? "codex";
  const detect: AgentDetectResult =
    overrides.detect !== undefined
      ? overrides.detect
      : { plan: null, apiKey: null };
  return {
    id,
    displayName: id === "claude" ? "Claude Code" : "Codex",
    installMarkerDir: "/nonexistent-marker",
    defaultModel: "glm-5.3-flash",
    isInstalled: () => Boolean(overrides.foreign) || Boolean(detect.apiKey),
    loadConfig: async () => {},
    unloadConfig: async () => {},
    detectCurrentConfig: () => detect,
    ...overrides,
  } as AgentManager;
}

/** Stub inquirer by injecting confirm; list-menu answers come via lastChoice. */
let menuAction: MenuAction = "keep";

function makeDeps(overrides: Partial<ResolveDeps> & { litellmKey?: string; confirmResult?: boolean } = {}): ResolveDeps {
  return {
    getLitellmKey: () => overrides.litellmKey,
    confirm: async () => overrides.confirmResult ?? true,
  };
}

// inquirer.prompt is stubbed so the rebind menu resolves instantly.
inquirer.prompt = ((async (questions: unknown) => {
  const q = Array.isArray(questions) ? (questions as { name?: string }[]) : [questions as { name?: string }];
  if (q.some((item) => item?.name === "action")) {
    return { action: menuAction };
  }
  throw new Error("unexpected prompt in tests");
})) as typeof inquirer.prompt;

describe("resolveExistingToolConfig", () => {
  test("not configured → proceed without prompts", async () => {
    const agent = makeMockAgent({ detect: { plan: null, apiKey: null } });
    const result = await resolveExistingToolConfig(agent, makeDeps());
    expect(result).toBe("proceed");
  });

  test("configured mimikkai with same key → keep", async () => {
    menuAction = "keep";
    const agent = makeMockAgent({ detect: { plan: "mimikkai", apiKey: "sk-live" } });
    const result = await resolveExistingToolConfig(agent, makeDeps({ litellmKey: "sk-live" }));
    expect(result).toBe("keep");
  });

  test("configured mimikkai with different key → unbind calls unloadConfig", async () => {
    menuAction = "unbind";
    let unloaded = 0;
    const agent = makeMockAgent({
      detect: { plan: "mimikkai", apiKey: "sk-other" },
      unloadConfig: async () => {
        unloaded++;
      },
    });
    const result = await resolveExistingToolConfig(agent, makeDeps({ litellmKey: "sk-current", confirmResult: false }));
    expect(unloaded).toBe(1);
    expect(result).toBe("unbind");
  });

  test("configured mimikkai → rebind returns reauthorise", async () => {
    menuAction = "rebind";
    const agent = makeMockAgent({ detect: { plan: "mimikkai", apiKey: "sk-live" } });
    const result = await resolveExistingToolConfig(agent, makeDeps({ litellmKey: "sk-live" }));
    expect(result).toBe("reauthorise");
  });

  test("foreign provider → confirm no → keep", async () => {
    menuAction = "keep"; // not reached; foreign branch asks confirm instead
    const agent = makeMockAgent({
      detect: { plan: null, apiKey: null },
      foreign: true,
      id: "codex",
    });
    // Monkey-patch detectForeignProvider through the exported probe by pointing
    // installMarkerDir at a temp file created below.
    const result = await resolveForeignFlow();
    expect(result).toBe("keep");
  });

  test("foreign provider → confirm yes → proceed", async () => {
    const result = await resolveForeignFlow(true);
    expect(result).toBe("proceed");
  });
});

/** Build a temp codex config.toml with a foreign provider and run the resolution. */
async function resolveForeignFlow(confirmYes = false): Promise<ToolConfigResolution> {
  const dir = mkdtempSync(join(tmpdir(), "mkk-test-"));
  writeFileSync(join(dir, "config.toml"), 'model_provider = "openai"\n', "utf-8");
  const agent = makeMockAgent({ id: "codex" });
  agent.installMarkerDir = dir;
  return await resolveExistingToolConfig(agent, {
    getLitellmKey: () => undefined,
    confirm: async () => confirmYes,
  });
}

describe("detectForeignProvider", () => {
  test("codex with foreign provider detected", async () => {
    const agent = makeMockAgent({ id: "codex" });

    const dir = mkdtempSync(join(tmpdir(), "mkk-test-"));
    writeFileSync(join(dir, "config.toml"), 'model_provider = "openai"\n', "utf-8");
    agent.installMarkerDir = dir;
    expect(detectForeignProvider(agent)).toBe(true);
  });

  test("codex with mimikkai provider not foreign", async () => {
    const agent = makeMockAgent({ id: "codex" });
    const dir = mkdtempSync(join(tmpdir(), "mkk-test-"));
    writeFileSync(join(dir, "config.toml"), 'model_provider = "MIMIKKAI"\n', "utf-8");
    agent.installMarkerDir = dir;
    expect(detectForeignProvider(agent)).toBe(false);
  });

  test("claude settings pointing at a different base URL is foreign", async () => {
    const agent = makeMockAgent({ id: "claude" });
    const dir = mkdtempSync(join(tmpdir(), "mkk-test-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://other.example.com" } }),
      "utf-8",
    );
    agent.installMarkerDir = dir;
    expect(detectForeignProvider(agent)).toBe(true);
  });

  test("claude settings pointing at LITELLM_BASE_URL not foreign", async () => {
    const agent = makeMockAgent({ id: "claude" });
    const dir = mkdtempSync(join(tmpdir(), "mkk-test-"));
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({ env: { ANTHROPIC_BASE_URL: LITELLM_BASE_URL } }),
      "utf-8",
    );
    agent.installMarkerDir = dir;
    expect(detectForeignProvider(agent)).toBe(false);
  });

  test("missing config files → not foreign", () => {
    const agent = makeMockAgent({ id: "codex", installMarkerDir: "/nonexistent-mkk-test" });
    expect(detectForeignProvider(agent)).toBe(false);
  });
});