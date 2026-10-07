# Plan: Проверка существующей конфигурации в init (codex / claude)

Ветка: — (fast-режим, работа в текущей ветке `main`)
Создан: 2026-10-07

## Original Request

можешь ли сделать настройку если уже добавлено, например, для codex
конфигурация в файл, то определять, если уже существует, то сообщать о
том что уже настроено и спрашивать о том, что нужно привязать другой
аккаунт или выйти из аккаунта (отвязать от конфигурации codex)

и аналогичной при настройке конфгурации claude

## Settings

- **Testing:** yes — bun test, детерминированные тесты
- **Logging:** standard — INFO для пользовательских событий, DEBUG — через существующий `logger`
- **Docs:** no — README обновлять не требуется

## Tasks

### Phase 1 — Логика существующей конфигурации

- [x] T1. `packages/cli/src/commands/toolConfig.ts` — `resolveExistingToolConfig(agent, deps)`:
      возврат `proceed | keep | unbind | reauthorise`; `detectCurrentConfig()`,
      сравнение с `configManager.getLitellmKey()`, детект «чужого провайдера»,
      интерактив через inquirer. Логирование: `logger.debug("init", ...)` на ветвлениях.
- [x] T2. i18n: ключи `init.alreadyConfigured`, `init.alreadyConfiguredOtherKey`,
      `init.rebindPrompt`, `init.rebindKeep`, `init.rebindUnbind`, `init.rebindRebind`,
      `init.unbound`, `init.configureAgainPrompt`, `init.overwriteForeignAsk`,
      `init.overwriteConfirm`, `init.overwriteCancelled` в `packages/cli/locales/ru_RU.json`
      и `en_US.json`.

### Phase 2 — Интеграция

- [x] T3. `packages/cli/src/commands/init.ts` — после выбора инструмента вызвать
      резолвер; ветки: `proceed` → настройка как сейчас; `keep` → готовое резюме
      без изменений конфигурации; `unbind` → `agent.unloadConfig()` уже вызван
      в резолвере; `reauthorise` → `runInteractiveAuth()` и настройка с новым
      лителлм-ключом.
- [x] T4. `packages/cli/src/commands/auth.ts` — `reloadTool`: при чужом провайдере
      спросить подтверждение (`defaultConfirmOverwrite`), при отказе — не трогать.

### Phase 3 — Tests

- [x] T5. `packages/cli/tests/toolConfig.test.ts` — 11 тестов (резолюция всех
      состояний + `detectForeignProvider` на temp-файлах codex/claude).

## Acceptance

- Повторный `init` для настроенного codex/claude предлагает меню
  keep/unbind/other-account вместо молчаливой перезаписи.
- Чужой провайдер не затирается без подтверждения (init и `auth reload`).
- `bun test` проходит; `typecheck` проходит; `bun run build` собирает dist.

Verified: 2026-10-07 — bun test 11 pass / tsc clean / build OK.