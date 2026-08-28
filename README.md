# pi-usage

Per-provider plan usage in the [pi](https://github.com/earendil-works/pi-mono) status line.

```
☁ go 5h 0% | wk 10% | mo 5% · reset 4h40m  ·  glm 5h 17% | wk 17% · reset 4h23m · lite  ·  ds ¥9.93
```

## Providers

| Provider | Label | API | Shows |
|---|---|---|---|
| OpenCode Go | `go` | `GET opencode.ai/zen/go/v1/usage` | rolling (5h) / weekly / monthly percent + 5h reset ETA |
| ZAI / GLM Coding Plan | `glm` | `GET {open.bigmodel.cn\|api.z.ai}/api/monitor/usage/quota/limit` | per-window credit percent (5h / weekly) + reset ETA + plan level. Same endpoint ZCode's usage panel calls. |
| DeepSeek | `ds` | `GET api.deepseek.com/user/balance` | pay-as-you-go CNY balance |
| OpenCode Zen | — | *(no public usage endpoint yet)* | reserved |

A provider is shown only when it backs the current session (`ctx.model.provider`), its API key resolves, and the endpoint answers; failures hide that segment silently. Switching sessions to another provider shows that provider's usage instead.

## Keys

First match wins:

1. Pi's own resolved auth for the session provider — `ctx.modelRegistry.getApiKeyForProvider` (whatever you configured with `/login` or in `~/.pi/agent/auth.json`; usually nothing to do)
2. `~/.pi/keys/<provider id>` — plain text, `chmod 600` recommended
3. environment variable — `OPENCODE_GO_API_KEY`, `ZAI_API_KEY`, `DEEPSEEK_API_KEY`

If your pi provider is already authenticated (e.g. you can chat with it), the status line just works — no extra setup. Only use the file/env paths when the endpoint needs a key that differs from the session's pi auth (e.g. a bare DeepSeek balance key while chatting via OpenCode Go):

```bash
mkdir -p ~/.pi/keys
printf '%s' 'sk-...' > ~/.pi/keys/deepseek
chmod 600 ~/.pi/keys/*
```

## Install

Global pi extension via symlink (auto-discovered, survives edits):

```bash
ln -s ~/src/workspace/github/pi-usage ~/.pi/agent/extensions/pi-usage
```

Then `/reload` inside pi.

## Preview without pi

Fetch every configured provider and print the status line text:

```bash
bun run preview
```

## Layout

```
index.ts            entry — assembles providers, renders segments, wires pi events
lib/types.ts        Provider / WindowStat / ProviderView contracts
lib/keys.ts         key resolution chain
lib/format.ts       fetch helper, reset ETA, percent rounding
providers/go.ts     OpenCode Go
providers/zai.ts    ZAI / GLM Coding Plan
providers/deepseek.ts  DeepSeek
```

## Adding a provider

1. Create `providers/<id>.ts` exporting a `Provider` (`id`, `piProviderIds` — the matching pi provider id(s) from `ctx.model.provider`, `label`, `envVar`, `fetch(key) → { windows?, note? } | null`).
2. Append it to `PROVIDERS` in `index.ts`.
3. If the endpoint needs a key that isn't the session's pi auth, drop it in `~/.pi/keys/<id>`.

## License

MIT
