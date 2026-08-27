/** OpenCode Go — https://opencode.ai/zen/go/v1/usage */

import { getJson, fmtEta, pct } from "../lib/format.ts";
import type { Provider, WindowStat } from "../lib/types.ts";

const URL_GO_USAGE = "https://opencode.ai/zen/go/v1/usage";

interface ZenWindow {
  percent?: number;
  resetsAt?: string;
}

async function fetchGo(key: string) {
  const data = await getJson(URL_GO_USAGE, key);
  const u = data?.usage;
  if (!u) return null;

  const mk = (w: ZenWindow | undefined, label: string): WindowStat | null => {
    const percent = pct(w?.percent);
    if (percent === null) return null;
    return {
      label,
      percent,
      resetAt: w?.resetsAt ? new Date(w.resetsAt).getTime() : undefined,
    };
  };

  const windows = [mk(u.rolling, "5h"), mk(u.weekly, "wk"), mk(u.monthly, "mo")].filter(
    (w): w is WindowStat => w !== null,
  );
  if (windows.length === 0) return null;
  return { windows };
}

export const goProvider: Provider = {
  id: "go",
  piProviderIds: ["opencode-go"],
  label: "go",
  envVar: "OPENCODE_GO_API_KEY",
  fetch: fetchGo,
};

export { fmtEta };
