/**
 * Tests for commands/toolConfig.ts — the unified init tool-action menu.
 * Deterministic: mock agent + stubbed inquirer.prompt; no real user files.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import inquirer from "inquirer";
import type { AgentManager, AgentDetectResult } from "../src/agents/base.ts";
import {
  detectForeignProvider,
  promptToolAction,
  type ToolAction,
  type ToolActionDeps,
} from "../src/commands/toolConfig.ts";
import { toolChoiceLabel } from "../src/commands/init.ts";
import { configManager } from "../src/config.ts";
import { LITELLM_BASE_URL } from "../src/agents/claudeCode.ts";

function makeMockAgent(overrides: Partial<AgentManager> & { detect?: AgentDetectResult; id?: string }): AgentManager {
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
    isInstalled: () => Boolean(detect.apiKey),
    loadConfig: async () => {},
    unloadConfig: async () => {},
    detectCurrentConfig: () => detect,
    ...overrides,
  } as AgentManager;
}

/** Stub inquirer: the tool-action list resolves from menuAction, confirms from confirmResult. */
let menuAction: ToolAction = "proceed";
let confirmResult = true;

inquirer.prompt = ((async (questions: unknown) => {
  const q = Array.isArray(questions) ? (questions as { name?: string; type?: string }[]) : [questions as { name?: string; type?: string }];
  if (q.some((item) => item?.name === "action")) {
    return { action: menuAction };
  }
  if (q.some((item) => item?.type === "confirm")) {
    return { ok: confirmResult };
  }
  throw new Error("unexpected prompt in tests");
})) as typeof inquirer.prompt;

function makeDeps(): ToolActionDeps {
  return { confirm: async () => confirmResult };
}

describe("promptToolAction", () => {
  test("not configured → proceed", async () => {
    menuAction = "proceed";
    const agent = makeMockAgent({ detect: { plan: null, apiKey: null } });
    const result = await promptToolAction(agent, makeDeps());
    expect(result).toBe("proceed");
  });

  test("configured mimikkai → proceed", async () => {
    menuAction = "proceed";
    const agent = makeMockAgent({ detect: { plan: "mimikkai", apiKey: "sk-live" } });
    const result = await promptToolAction(agent, makeDeps());
    expect(result).toBe("proceed");
  });

  test("unbind on configured tool calls unloadConfig and returns unbind", async () => {
    menuAction = "unbind";
    let unloaded = 0;
    const agent = makeMockAgent({
      detect: { plan: "mimikkai", apiKey: "sk-live" },
      unloadConfig: async () => {
        unloaded++;
      },
    });
    const result = await promptToolAction(agent, makeDeps());
    expect(unloaded).toBe(1);
    expect(result).toBe("unbind");
  });

  test("unbind on not-configured tool skips unloadConfig and returns keep", async () => {
    menuAction = "unbind";
    let unloaded = 0;
    const agent = makeMockAgent({
      detect: { plan: null, apiKey: null },
      unloadConfig: async () => {
        unloaded++;
      },
    });
    const result = await promptToolAction(agent, makeDeps());
    expect(unloaded).toBe(0);
    expect(result).toBe("keep");
  });

  test("unbind on foreign-configured tool skips unloadConfig and returns keep", async () => {
    menuAction = "unbind";
    let unloaded = 0;
    const agent = makeMockAgent({
      id: "claude",
      detect: { plan: null, apiKey: null },
      unloadConfig: async () => {
        unloaded++;
      },
    });
    const result = await promptToolAction(agent, makeDeps());
    expect(unloaded).toBe(0);
    expect(result).toBe("keep");
  });

  test("rebind returns rebind without side effects", async () => {
    menuAction = "rebind";
    let unloaded = 0;
    const agent = makeMockAgent({
      detect: { plan: "mimikkai", apiKey: "sk-live" },
      unloadConfig: async () => {
        unloaded++;
      },
    });
    const result = await promptToolAction(agent, makeDeps());
    expect(unloaded).toBe(0);
    expect(result).toBe("rebind");
  });
});

describe("toolChoiceLabel", () => {
  test("bound tool shows MimikkAi-bound label", () => {
    configManager.setLang("en_US");
    const agent = makeMockAgent({ id: "codex", detect: { plan: "mimikkai", apiKey: "sk-live" } });
    expect(toolChoiceLabel(agent)).toBe("Codex (configured for MimikkAi)");
  });

  test("unbound tool shows not-configured label", () => {
    configManager.setLang("en_US");
    const agent = makeMockAgent({ id: "codex", detect: { plan: null, apiKey: null } });
    expect(toolChoiceLabel(agent)).toBe("Codex (not configured for MimikkAi)");
  });
});

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