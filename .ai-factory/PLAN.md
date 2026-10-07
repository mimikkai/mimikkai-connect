# Plan: Единое меню действий в init для claude / codex

Ветка: — (fast-режим, работа в текущей ветке `main`)
Создан: 2026-10-07

## Original Request

можно ли немного поменять флоу

то есть когда выбирается claude или codex

то тогда допустим спрашивается, убрать конфигурацию из claude или codex (так как
пользователь может хотеть использовать модели из claude или codex) и надо дать
пункт отвязать аккаунт. а после отвязки спрашивается привязать другой аккаунт?

## Settings

- **Testing:** yes — bun test, детерминированные тесты (паттерн `packages/cli/tests/toolConfig.test.ts`: mock-агент, инъекция confirm, стаб inquirer.prompt)
- **Logging:** standard — пользовательские события через `console.log`/`chalk`, ветвления через `logger.debug("init", ...)`
- **Docs:** no — README не меняется

## Решения (из обсуждения)

1. Меню действий показывается **всегда** сразу после выбора claude/codex, до любой
   авторизации, независимо от состояния конфигурации (mimikkai / чужой провайдер / чисто).
2. Отвязка — **локальная**: `agent.unloadConfig()` (settings.json / config.toml);
   глобальный ключ в `configManager` не трогаем.
3. Глобальный вопрос «аккаунт уже привязан → привязать другой?» (init.ts:68,
   ключи `accountBoundPrompt`/`accountBindOther`) удаляется — смена аккаунта
   становится пунктом меню.

## Новый флоу

```
Выбор языка → Выбор инструмента (claude/codex)
        │
        v
Меню (всегда):
  > Настроить {{tool}} на mimikkai          [proceed]
    Убрать конфигурацию mimikkai из {{tool}} [unbind]
    Привязать другой аккаунт mimikkai        [rebind]
        │
proceed: auth при отсутствии ключа → foreign-overwrite guard (как сейчас)
         → loadConfig → summary
unbind:  unloadConfig() → «Привязать другой аккаунт?» — да: auth → loadConfig;
         нет: summary, конфиг инструмента отсутствует
rebind:  runInteractiveAuth() → loadConfig с новым ключом
```

Ключи `init.accountBound*`, `init.rebindKeep`, `init.rebindPrompt`,
`init.alreadyConfigured*` удаляются (чистая замена), старое меню
`resolveExistingToolConfig` упраздняется; foreign-probe и его overwrite-confirm
сохраняются.

## Tasks

### Phase 1 — Меню и логика

- [x] T1. `packages/cli/src/commands/toolConfig.ts` — заменить
      `resolveExistingToolConfig(agent, deps)` на `promptToolAction(agent)`:
      inquirer list с тремя выборами `proceed | unbind | rebind` (меню показывается
      всегда; пункт unbind для ненастроенного инструмента — лёгкое предупреждение
      «конфигурация mimikkai не найдена» и выход в summary). Logging:
      `logger.debug("init", "${agent.id}: action=${value}")`. Удалить ставшие
      мёртвыми ключи и ветку keep.
- [x] T2. i18n: `packages/cli/locales/ru_RU.json` + `en_US.json` (+ синхронно
      `packages/cli/dist/locales/` при их участии в сборке — проверить, что dist
      регенерируется `bun run build`, иначе обновить и их) — новые ключи
      `init.actionPrompt` («Что сделать с {{tool}}?»), `init.actionConfigure`,
      `init.actionUnbind`, `init.actionRebind`, `init.unbindConfirmRebind`
      («Привязать другой аккаунт?»), `init.unbindNothing`; удалить
      `accountBound`, `accountBoundPrompt`, `accountBindOther`,
      `alreadyConfigured`, `alreadyConfiguredOtherKey`, `rebindPrompt`,
      `rebindKeep`, `rebindUnbind`, `rebindRebind`, `configureAgainPrompt`.

### Phase 2 — Интеграция

- [x] T3. `packages/cli/src/commands/init.ts` — убрать глобальный блок
      «аккаунт уже привязан?» (строки 63–86); после выбора инструмента вызвать
      `promptToolAction`: `proceed` → auth при отсутствии
      `configManager.getLitellmKey()`, затем foreign-overwrite guard
      (`detectForeignProvider` + confirm) → `loadConfig`; `unbind` →
      `agent.unloadConfig()` → confirm rebind → auth+loadConfig либо summary;
      `rebind` → `runInteractiveAuth()` → `loadConfig`. Summary во всех исходах.
      Logging: `logger.debug("init", "unified tool-action menu")`.
- [x] T4. Проверить прочих вызовчиков `resolveExistingToolConfig`
      (`auth reload <tool>` в `auth.ts`): переключить на новую семантику или
      оставить отдельный подтверждительный путь — по факту использования.

### Phase 3 — Tests

- [x] T5. `packages/cli/tests/toolConfig.test.ts` — переписать под
      `promptToolAction`: стабы inquirer на три выбора; сценарии для каждого
      состояния конфигурации (mimikkai-конфиг / чисто / чужой провайдер);
      ветку unbind-then-rebind-confirm покрыть через инъекцию confirm.
      Регрессия: `bun test`, `bun run typecheck`, `bun run build`.

Verified: 2026-10-07 — bun test 11 pass / tsc --noEmit clean / build OK.
Verify fix: «убирать нечего» (нет mimikkai-конфига) возвращает `keep` →
summary, без вопроса о другом аккаунте и без перенастройки инструмента;
вопрос «Привязать другой аккаунт?» задаётся только после реальной отвязки.
Verify fix 2: после успешной отвязки (без повторной привязки) показывается
`init.unboundSummary` — явное «инструмент не привязан + глобальный ключ остаётся
(auth revoke для полной отвязки)», вместо общего «Настройка завершена /
Аккаунт: authenticated», которое выглядело как «всё ещё привязан».

## Refinement (2026-10-07) — статус mimikkai-конфигурации в списках

### Original Request (уточнение)

можно ли указать чтобы показывало что конфигурация установлена или не установлена

### Tasks (новые)

### Phase 4 — Статус конфигурации в селекторе

- [x] T6. `packages/cli/src/commands/init.ts` + i18n — рядом с флагом установки
      показывать mimikkai-статус: `claudeCodeManager.detectCurrentConfig().plan === "mimikkai"`
      → «настроен на mimikkai» / «не настроен на mimikkai» (ключи `init.toolMimikkaiBound`,
      `init.toolMimikkaiUnbound`, ru/en). Codex-аналогично.
- [x] T7. Тесты: unit-форматирования метки выбора (label builder вынесен в
      чистую функцию в init.ts), `bun test` + typecheck + build.
- [x] T11 (решение пользователя): из лейбла выбора убрать флаг установки
      «установлен/не установлен» (ключи `toolInstalled`/`toolNotInstalled`
      удалены) — показывается только статус MimikkAi-конфигурации.
      Предупреждение `toolNotInstalledWarn` (T10) сохранено.

## Refinement (2026-10-07, 2) — улучшение вывода init

- [x] T8. `init.configured`: «Готово! {{tool}} теперь работает через MimikkAi
      (модель: {{model}}).» / «Done! {{tool}} now runs through MimikkAi...».
- [x] T9. `init.summary` — добавлена строка «Ключ MimikkAi: {{key}}»
      (obfuscated); «План» → «Тариф» (ru). Дублирующиеся консольные вызовы
      сведены в `printSummary(tool)` в init.ts (3 call-site → 1 хелпер).
- [x] T10. Если выбранный инструмент не установлен (`agent.isInstalled()` =
      false) — после записи конфигурации вывести жёлтое предупреждение
      `init.toolNotInstalledWarn` + `logger.warn("init", ...)`.
- [x] T12. ASCII-логотип MimikkAi при старте init: `packages/cli/src/utils/logo.ts`
      (`printLogo()`, ГОСТ-«888», выводится в cyan перед welcome-строкой).

## Commit Plan
- 1 коммит после T1–T2: `feat(cli): unified tool-action menu in init wizard`
- 1 коммит после T3–T4: `refactor(cli): drop global account rebind prompt, route init through menu`
- 1 коммит после T5: `test(cli): cover promptToolAction states`

## Acceptance

- При выборе claude/codex в `init` сразу показывается меню
  настроить/убрать конфигурацию/привязать другой аккаунт — независимо от того,
  был ли инструмент уже настроен на mimikkai.
- «Убрать конфигурацию» снимает только конфиг инструмента (`agent.unloadConfig()`),
  globальный ключ остаётся; после этого спрашивается «Привязать другой аккаунт?».
  Если mimikkai-конфига не было — предупреждение и возврат в обычный путь без
  вопроса о другом аккаунте.
- Повторный вопрос о глобальном аккаунте до меню больше не задаётся.
- Чужой провайдер по-прежнему не затирается без подтверждения.
- `bun test`, `tsc --noEmit`, `bun run build` проходят.