/**
 * Render the status line in a terminal without pi.
 * Exercises the exact same providers + renderer as the extension.
 */

import { resolveKey } from "../lib/keys.ts";
import { fmtEta } from "../lib/format.ts";
import type { Provider, ProviderView } from "../lib/types.ts";
import { goProvider } from "../providers/go.ts";
import { zaiProvider } from "../providers/zai.ts";
import { deepseekProvider } from "../providers/deepseek.ts";

const PROVIDERS: Provider[] = [goProvider, zaiProvider, deepseekProvider];

const noTheme = { fg: (_c: string, t: string) => t };

function renderView(view: ProviderView): string {
  const parts: string[] = [];
  for (const w of view.windows ?? []) parts.push(`${w.label} ${w.percent}%`);
  const etas = (view.windows ?? []).map((w) => fmtEta(w.resetAt)).filter((e): e is string => !!e);
  if (etas.length > 0) parts.push(etas[0]);
  if (view.note) parts.push(view.note);
  return parts.join(" | ");
}

const segments: string[] = [];
// When run inside pi, only show the provider of the active session
// (mirrors the extension; omit PI_PROVIDER to preview every provider).
const activeProvider = process.env.PI_PROVIDER;
for (const p of PROVIDERS) {
  if (activeProvider && !p.piProviderIds.includes(activeProvider)) continue;
  const key = resolveKey(p.id, p.envVar);
  if (!key) {
    console.error(`[skip] ${p.id}: no key (checked ~/.pi/keys/${p.id}, ${p.envVar}, bridge.toml)`);
    continue;
  }
  const view = await p.fetch(key);
  if (!view) {
    console.error(`[skip] ${p.id}: endpoint unavailable`);
    continue;
  }
  segments.push(`${p.label} ${renderView(view)}`);
}

console.log(segments.length ? `☁ ${segments.join("  ·  ")}` : "(nothing to show)");
