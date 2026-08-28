/**
 * pi-usage — per-provider plan usage in the pi status line.
 *
 * Renders one segment for the provider backing the current session, e.g.:
 *   ☁ go 5h 0% | wk 10% | mo 5% · reset 4h40m
 *
 * Only the provider matching ctx.model.provider is fetched; with a GLM
 * session the line shows glm 5h 17% · reset 4h23m instead.
 *
 * Each segment is colored by its most urgent window:
 *   >=90% error, >=70% warning, otherwise success. Windows refresh
 *   every 5 minutes and after every turn. A provider that fails or
 *   has no key is skipped silently; with nothing to show the status
 *   entry is hidden.
 *
 * Key resolution per provider (first match wins):
 *   1. pi's own resolved auth for the session provider
 *      (ctx.modelRegistry.getApiKeyForProvider — auth.json / /login)
 *   2. ~/.pi/keys/<id>          (plain text, chmod 600)
 *   3. env <PROVIDER>_API_KEY
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveKey } from "./lib/keys.ts";
import { fmtEta } from "./lib/format.ts";
import type { Provider, ProviderView, Theme } from "./lib/types.ts";
import { goProvider } from "./providers/go.ts";
import { zaiProvider } from "./providers/zai.ts";
import { deepseekProvider } from "./providers/deepseek.ts";

const REFRESH_MS = 5 * 60 * 1000;
const STATUS_ID = "pi-usage";

const PROVIDERS: Provider[] = [goProvider, zaiProvider, deepseekProvider];

/** Minimal surface of ctx.modelRegistry used for key resolution. */
interface KeyRegistry {
  getApiKeyForProvider(provider: string): Promise<string | undefined>;
}

/**
 * Resolve the API key for a usage provider, first match wins:
 *   1. pi's own resolved auth (auth.json / login) for the session provider
 *   2. ~/.pi/keys/<id> plain-text file
 *   3. env <PROVIDER>_API_KEY
 */
async function resolveProviderKey(
  p: Provider,
  registry?: KeyRegistry,
): Promise<string | null | undefined> {
  if (registry) {
    for (const pid of p.piProviderIds) {
      try {
        const key = await registry.getApiKeyForProvider(pid);
        if (key) return key;
      } catch {
        /* try the next pi provider id */
      }
    }
  }
  return resolveKey(p.id, p.envVar);
}

/** "5h 17% | wk 17% · reset 4h23m · lite" for one provider's view. */
function renderView(theme: Theme, view: ProviderView): string {
  const dim = (s: string) => theme.fg("dim", s);
  const parts: string[] = [];

  for (const w of view.windows ?? []) {
    const color = w.percent >= 90 ? "error" : w.percent >= 70 ? "warning" : "success";
    parts.push(theme.fg(color, `${w.label} ${w.percent}%`));
  }

  const etas = (view.windows ?? []).map((w) => fmtEta(w.resetAt)).filter((e): e is string => !!e);
  if (etas.length > 0) parts.push(dim(etas[0]));

  if (view.note) parts.push(dim(view.note));

  return parts.join(dim(" | "));
}

async function update(ui: any, activeProvider?: string, registry?: KeyRegistry) {
  const dim = (s: string) => ui.theme.fg("dim", s);
  const segments: string[] = [];

  for (const p of PROVIDERS) {
    // Only show the provider backing the current session.
    if (activeProvider && !p.piProviderIds.includes(activeProvider)) continue;
    const key = await resolveProviderKey(p, registry);
    if (!key) continue;
    try {
      const view = await p.fetch(key);
      if (!view) continue;
      segments.push(ui.theme.fg("accent", p.label) + dim(" ") + renderView(ui.theme, view));
    } catch {
      // provider fetch errors never break the status line
    }
  }

  if (segments.length === 0) {
    ui.setStatus(STATUS_ID, undefined);
    return;
  }
  ui.setStatus(STATUS_ID, dim("☁ ") + segments.join(dim("  ·  ")));
}

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let activeProvider: string | undefined;
  let registry: KeyRegistry | undefined;

  function startTimer(ui: any) {
    if (timer) clearInterval(timer);
    timer = setInterval(() => update(ui, activeProvider, registry), REFRESH_MS);
  }

  pi.on("session_start", async (_event, ctx) => {
    activeProvider = ctx.model?.provider;
    registry = ctx.modelRegistry;
    await update(ctx.ui, activeProvider, registry);
    startTimer(ctx.ui);
  });

  pi.on("turn_end", async (_event, ctx) => {
    await update(ctx.ui, activeProvider, registry);
  });

  pi.on("model_select", async (event: any, ctx) => {
    activeProvider = event.model?.provider;
    registry = ctx.modelRegistry;
    await update(ctx.ui, activeProvider, registry);
    startTimer(ctx.ui);
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = null;
  });
}
