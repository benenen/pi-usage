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
 *   1. ~/.pi/keys/<id>          (plain text, chmod 600)
 *   2. env <PROVIDER>_API_KEY
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

async function update(ui: any, activeProvider?: string) {
  const dim = (s: string) => ui.theme.fg("dim", s);
  const segments: string[] = [];

  for (const p of PROVIDERS) {
    // Only show the provider backing the current session.
    if (activeProvider && !p.piProviderIds.includes(activeProvider)) continue;
    const key = resolveKey(p.id, p.envVar);
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

  function startTimer(ui: any) {
    if (timer) clearInterval(timer);
    timer = setInterval(() => update(ui, activeProvider), REFRESH_MS);
  }

  pi.on("session_start", async (_event, ctx) => {
    activeProvider = ctx.model?.provider;
    await update(ctx.ui, activeProvider);
    startTimer(ctx.ui);
  });

  pi.on("turn_end", async (_event, ctx) => {
    await update(ctx.ui, activeProvider);
  });

  pi.on("model_select", async (event, ctx) => {
    activeProvider = event.model?.provider;
    await update(ctx.ui, activeProvider);
    startTimer(ctx.ui);
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = null;
  });
}
