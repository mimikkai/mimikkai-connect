# mimikkai-connect

CLI для настройки coding-агентов (Claude Code, Codex) на аккаунте [mimikkai.ru](https://mimikkai.ru).

## Установка / запуск

```bash
npx github:mimikkai/mimikkai-connect init
bunx github:mimikkai/mimikkai-connect init
```

## Команды

```text
# Show help
 -h
 --help

# Show version
 -v
 --version

# Run the initialization wizard
 init

# Language management
 lang show              # Display the current language
 lang set ru_RU         # Switch to Russian (default)
 lang set en_US         # Switch to English
 lang --help            # Show help for language commands

# API key management
 auth                   # Interactively set the key (device flow via browser)
 auth glm_coding_plan_global <token>    # Choose the Global plan and set the key directly
 auth glm_coding_plan_china <token>     # Choose the China plan and set the key directly
 auth revoke            # Delete the saved key and unload agent configs
 auth reload claude     # Load the latest plan info into the Claude Code tool
 auth --help            # Show help for auth commands

# Health check
 doctor                 # Inspect system configuration and tool status
```

> Примечание: у mimikkai один endpoint (`litellm.mimikkai.ru`), поэтому `glm_coding_plan_global` и `glm_coding_plan_china` — алиасы, URL они не меняют.

## Как это работает

```
mimikkai-connect
  ├─ auth: device flow на service.mimikkai.ru
  │    POST /api/auth/device/authorize → user_code + verification_uri
  │    (URL переписывается на panel.mimikkai.ru)
  │    POST /api/auth/device/token     → polling до подтверждения
  │    GraphQL userViewer              → валидация токена
  │    GraphQL GetUserApiKey           → LiteLLM virtual key (sk-...)
  ├─ config: ~/.mimikkai-connect/config.yaml
  │    lang, plan, api_key, litellm_key
  └─ agents: запись конфига инструмента
       ├─ claude → ~/.claude/settings.json
       │    env.ANTHROPIC_AUTH_TOKEN  = <litellm_key>
       │    env.ANTHROPIC_BASE_URL    = https://litellm.mimikkai.ru
       │    env.ANTHROPIC_DEFAULT_*_MODEL = glm-5.3-flash
       └─ codex  → ~/.codex/config.toml
            model_provider = MIMIKKAI
            model_providers.MIMIKKAI.base_url = https://litellm.mimikkai.ru/v1
            wire_api = chat
```

Дефолтная модель — `glm-5.3-flash`. При `unload` (revoke) удаляются только поля, записанные mimikkai-connect; ваши настройки инструментов не трогаются.

## Быстрый старт

```bash
bunx github:mimikkai/mimikkai-connect init
```

Мастер: выбор языка (ru_RU по умолчанию) → авторизация в браузере → выбор инструмента (Claude Code / Codex) → запись конфига.

## Диагностика

```bash
bunx github:mimikkai/mimikkai-connect doctor
```

Проверяет: конфиг, сохранённый ключ, его валидность, установку и настройку Claude Code / Codex. Коды выхода: 0 — всё OK, 1 — есть проблемы.

## Разработка

```bash
git clone https://github.com/mimikkai/mimikkai-connect
cd mimikkai-connect/packages/cli
bun install
bun run dev        # запуск из исходников
bun run build      # dist/cli.js (bun) + dist/cli.node.mjs (node) + locales
bun run typecheck
```

Стек: Bun + TypeScript, commander, inquirer, ora, chalk, js-yaml, smol-toml.

## Лицензия

MIT