# pi-usage

Per-provider plan usage on the last line of the [pi](https://github.com/earendil-works/pi-mono) footer.

```
~/src/workspace/github/pi-usage (main)
↑4.5k ↓1.4k R250k W8.0k CH96.8% $0.412 41.2%/200k            (anthropic) claude-sonnet-4-5 • low
ctx 41% LSP Inactive 1 subagent
☁ go 5h 1% | wk 10% | mo 6% | reset 3h56m
```

## Footer

pi merges every extension's `ctx.ui.setStatus()` text into one line and truncates
it from the right, so a status entry cannot reserve the bottom line — a long line
or another extension can push it out of view. pi-usage instead takes the footer
over with `ctx.ui.setFooter()` and renders the usage segment itself, always last:

- line 1 — `cwd (branch)`, plus the session name when set
- line 2 — `↑input ↓output RcacheRead WcacheWrite CHhit% $cost context%`, with
  `(provider) model • thinking` right-aligned
- line 3 — the other extensions' statuses, newlines flattened, joined with
  spaces, truncated from the right (what pi does)
- last line — `☁ <provider> <windows> | reset <eta>`, or nothing at all when no
  provider answered

Deliberately dropped from pi's built-in footer: the `(auto)`/`(sub)` thinking
markers and the xp progress / reflection bits.

Caveats:

- pi allows one custom footer per session: a second `ctx.ui.setFooter()` call
  replaces ours, and ours replaces it. pi-usage cannot coexist with another
  extension that owns the footer. Its own status entry is cleared, so the
  segment never renders twice.
- Without a footer (rpc / json / print mode, or an older pi) the segment falls
  back to the plain status line.
- The footer is built on pi's stable `@earendil-works/pi-tui` API
  (`visibleWidth`, `truncateToWidth`, `Component.render(width)`), so a pi upgrade
  cannot break it — but it also doesn't inherit changes pi makes to its own
  footer.

`node scripts/preview-footer.ts` renders it offline at several widths, no pi and
no network needed.

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

If your pi provider is already authenticated (e.g. you can chat with it), the usage line just works — no extra setup. Only use the file/env paths when the endpoint needs a key that differs from the session's pi auth (e.g. a bare DeepSeek balance key while chatting via OpenCode Go):

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

Fetch every configured provider and print the usage line text (needs a key):

```bash
bun run preview
```

Render the whole footer offline at widths 200 / 96 / 58 / 30 (no key, no
network — fake session and providers):

```bash
node scripts/preview-footer.ts
```

## Layout

```
index.ts            entry — assembles providers, resolves segments, wires pi events
lib/types.ts        Provider / WindowStat / ProviderView contracts
lib/keys.ts         key resolution chain
lib/format.ts       fetch helper, reset ETA, percent rounding
lib/footer.ts       custom footer: pwd / stats / other statuses / usage line last
providers/go.ts     OpenCode Go
providers/zai.ts    ZAI / GLM Coding Plan
providers/deepseek.ts  DeepSeek
scripts/preview.ts        usage line text, live providers
scripts/preview-footer.ts whole footer, offline
```

## Adding a provider

1. Create `providers/<id>.ts` exporting a `Provider` (`id`, `piProviderIds` — the matching pi provider id(s) from `ctx.model.provider`, `label`, `envVar`, `fetch(key) → { windows?, note? } | null`).
2. Append it to `PROVIDERS` in `index.ts`.
3. If the endpoint needs a key that isn't the session's pi auth, drop it in `~/.pi/keys/<id>`.

## License

MIT
