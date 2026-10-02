/**
 * pi-usage — per-provider plan usage on the last line of the pi footer.
 *
 * Renders one segment for the provider backing the current session, e.g.:
 *   ☁ go 5h 0% | wk 10% | mo 5% | reset 4h40m
 *
 * Only the provider matching ctx.model.provider is fetched; with a GLM
 * session the segment shows glm 5h 17% | reset 4h23m | lite instead.
 *
 * The segment always sits on the LAST footer line: pi merges every extension's
 * ctx.ui.setStatus() text into one line, so owning the bottom line means taking
 * the whole footer over with ctx.ui.setFooter() (see lib/footer.ts, which
 * rebuilds the built-in pwd/stats/model lines above it). In run modes without a
 * footer the segment falls back to the plain status line.
 *
 * Each segment is colored by its most urgent window:
 *   >=90% error, >=70% warning, otherwise success. Windows refresh
 *   every 5 minutes and after every turn. A provider that fails or
 *   has no key is skipped silently; with nothing to show the line is hidden.
 *
 * Key resolution per provider (first match wins):
 *   1. pi's own resolved auth for the session provider
 *      (ctx.modelRegistry.getApiKeyForProvider — auth.json / /login)
 *   2. ~/.pi/keys/<id>          (plain text, chmod 600)
 *   3. env <PROVIDER>_API_KEY
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { createFooter } from "./lib/footer.ts";
import { resolveKey } from "./lib/keys.ts";
import { fmtEta } from "./lib/format.ts";
import type { Provider, ProviderView, Theme } from "./lib/types.ts";
import { goProvider } from "./providers/go.ts";
import { zaiProvider } from "./providers/zai.ts";
import { deepseekProvider } from "./providers/deepseek.ts";

const REFRESH_MS = 5 * 60 * 1000;
const STATUS_ID = "pi-usage";

const PROVIDERS: Provider[] = [goProvider, zaiProvider, deepseekProvider];

/** One provider's rendered segment: its label plus what the endpoint reported. */
interface Segment {
  label: string;
  view: ProviderView;
}

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

/** "5h 17% | wk 17% | reset 4h23m | lite" for one provider's view. */
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

/** `☁ go 5h 1% | wk 10% | reset 3h56m`, or undefined when nothing to show. */
function renderUsageLine(theme: Theme, segments: readonly Segment[]): string | undefined {
  if (segments.length === 0) return undefined;
  const dim = (s: string) => theme.fg("dim", s);
  const rendered = segments.map((s) => theme.fg("accent", s.label) + dim(" ") + renderView(theme, s.view));
  return dim("☁ ") + rendered.join(dim("  ·  "));
}

/** Fetch one segment per provider backing the current session. */
async function collectSegments(activeProvider?: string, registry?: KeyRegistry): Promise<Segment[]> {
  const segments: Segment[] = [];

  for (const p of PROVIDERS) {
    // Only show the provider backing the current session.
    if (activeProvider && !p.piProviderIds.includes(activeProvider)) continue;
    const key = await resolveProviderKey(p, registry);
    if (!key) continue;
    try {
      const view = await p.fetch(key);
      if (!view) continue;
      segments.push({ label: p.label, view });
    } catch {
      // provider fetch errors never break the footer
    }
  }

  return segments;
}

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let activeProvider: string | undefined;
  let registry: KeyRegistry | undefined;
  let segments: Segment[] = [];
  /** Set while a custom footer renders the segment itself. */
  let requestRender: (() => void) | undefined;

  async function refresh(ui: any) {
    segments = await collectSegments(activeProvider, registry);
    if (requestRender) requestRender();
    // Without the custom footer (rpc/json/print modes) keep the status entry.
    else ui.setStatus(STATUS_ID, renderUsageLine(ui.theme, segments));
  }

  function startTimer(ui: any) {
    if (timer) clearInterval(timer);
    timer = setInterval(() => refresh(ui), REFRESH_MS);
  }

  pi.on("session_start", async (_event, ctx) => {
    activeProvider = ctx.model?.provider;
    registry = ctx.modelRegistry;

    // The footer owns the last line, so the segment moves there instead of into
    // the shared status line — pi-usage renders it itself in that case.
    if (ctx.mode === "tui" && ctx.ui.setFooter) {
      ctx.ui.setStatus(STATUS_ID, undefined);
      ctx.ui.setFooter((tui, theme, footerData) => {
        requestRender = () => tui.requestRender();
        return createFooter({
          ctx,
          theme,
          footerData,
          tui,
          width: { width: visibleWidth, truncate: truncateToWidth },
          usageLine: () => renderUsageLine(theme, segments),
          onDispose: () => {
            requestRender = undefined;
          },
        });
      });
    }

    await refresh(ctx.ui);
    startTimer(ctx.ui);
  });

  pi.on("turn_end", async (_event, ctx) => {
    await refresh(ctx.ui);
  });

  pi.on("model_select", async (event: any, ctx) => {
    activeProvider = event.model?.provider;
    registry = ctx.modelRegistry;
    await refresh(ctx.ui);
    startTimer(ctx.ui);
  });

  pi.on("session_shutdown", async () => {
    if (timer) clearInterval(timer);
    timer = null;
    requestRender = undefined;
  });
}
