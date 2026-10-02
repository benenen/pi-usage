/**
 * The footer pi-usage renders when it owns the last line.
 *
 * pi merges every extension's `ctx.ui.setStatus()` text into ONE footer line
 * (`dist/modes/interactive/components/footer.js`), and that line is already the
 * last one, so a status can never sit *below* another extension's status. To own
 * the bottom line pi-usage takes the whole footer over via `ctx.ui.setFooter()`
 * and rebuilds the built-in content above its own line:
 *
 *   ~/src/app (main) • my session
 *   ↑12k ↓3.4k R120k W8k CH91.2% $0.412 41.0%/200k        claude-sonnet-4-5 • low
 *   <other extensions' status lines — pi-lens, goal, subagents, …>
 *   ☁ go 5h 1% | wk 10% | mo 6% | reset 3h56m        <- pi-usage, always last
 *
 * Mirrors the built-in footer of pi 1.0.0. Only package roots are aliased for
 * extensions, so the built-in component cannot be imported — this is a copy and
 * can drift; re-check `dist/modes/interactive/components/footer.js` after a pi
 * upgrade. Not rebuilt on purpose (the extension context exposes neither the
 * setting nor the session runtime behind them): the experimental "xp" marker,
 * the auto-compact marker, the "(sub)" subscription cost marker and the
 * routed-model arrow.
 *
 * Width helpers are injected so this module imports nothing from pi and can be
 * rendered by `scripts/preview-footer.ts` under plain node.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";

/** The part of pi's `Theme` used here. */
export interface FooterTheme {
  fg(color: string, text: string): string;
}

/** The part of pi's footer data provider used here. */
export interface FooterData {
  getGitBranch(): string | null;
  getExtensionStatuses(): ReadonlyMap<string, string>;
  getAvailableProviderCount(): number;
  onBranchChange(callback: () => void): () => void;
}

/** The part of the extension context the footer reads. */
export interface FooterContext {
  cwd: string;
  model?: { id: string; provider: string; contextWindow?: number; reasoning?: boolean };
  thinkingLevel?: string;
  getContextUsage(): { contextWindow: number; percent: number | null } | undefined;
  sessionManager: {
    getEntries(): readonly unknown[];
    /** Session identity — the read-only view has no entry count, so the stats cache keys on session + leaf. */
    getSessionId(): string;
    getLeafId(): string | null;
    getSessionName(): string | undefined;
  };
}

/** Injected pi-tui helpers. */
export interface WidthTools {
  width(text: string): number;
  truncate(text: string, maxWidth: number, ellipsis?: string): string;
}

export interface FooterOptions {
  ctx: FooterContext;
  theme: FooterTheme;
  footerData: FooterData;
  /** Needs a requestRender for the branch watcher; pi passes the TUI to the footer factory. */
  tui: { requestRender(): void };
  width: WidthTools;
  /** The pi-usage line, already themed by the caller. `undefined` hides the line. */
  usageLine(): string | undefined;
  /** Called when the footer is replaced or removed by pi. */
  onDispose?: () => void;
}

export interface FooterComponent {
  render(width: number): string[];
  invalidate(): void;
  dispose(): void;
}

/** Compact token counts, as the built-in footer does. */
export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

/** `~/src/app` when cwd is below home, otherwise the path unchanged. */
export function formatCwd(cwd: string, home: string | undefined): string {
  if (!home) return cwd;
  const rel = relative(resolve(home), resolve(cwd));
  const insideHome = rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  if (!insideHome) return cwd;
  return rel === "" ? "~" : `~${sep}${rel}`;
}

/** Status texts are single-line by contract: flatten control characters. */
export function sanitizeStatusText(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

function addUsage(totals: UsageTotals, usage: any): void {
  totals.input += usage?.input ?? 0;
  totals.output += usage?.output ?? 0;
  totals.cacheRead += usage?.cacheRead ?? 0;
  totals.cacheWrite += usage?.cacheWrite ?? 0;
  totals.cost += usage?.cost?.total ?? 0;
}

export function createFooter(options: FooterOptions): FooterComponent {
  const { ctx, theme, footerData, tui, width: w, usageLine, onDispose } = options;
  const dim = (s: string) => theme.fg("dim", s);

  const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let latestCacheHitRate: number | undefined;
  let statsKey: string | undefined;

  /**
   * Session-wide usage totals. The footer renders on every frame and this walks
   * every session entry (and asks for context usage), so it only recomputes when
   * the session actually moved (new leaf = new entry, or a different session).
   */
  function refreshStats(): void {
    const key = `${ctx.sessionManager.getSessionId()}:${ctx.sessionManager.getLeafId() ?? ""}:${ctx.model?.id ?? ""}`;
    if (key === statsKey) return;
    statsKey = key;

    totals.input = totals.output = totals.cacheRead = totals.cacheWrite = totals.cost = 0;
    latestCacheHitRate = undefined;
    for (const entry of ctx.sessionManager.getEntries() as any[]) {
      if (entry.type === "usage") {
        addUsage(totals, entry.usage);
      } else if (entry.type === "message" && entry.message.role === "assistant") {
        addUsage(totals, entry.message.usage);
        const usage = entry.message.usage;
        const prompt = (usage?.input ?? 0) + (usage?.cacheRead ?? 0) + (usage?.cacheWrite ?? 0);
        latestCacheHitRate = prompt > 0 ? (usage.cacheRead / prompt) * 100 : undefined;
      } else if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.usage) {
        addUsage(totals, entry.message.usage);
      } else if ((entry.type === "branch_summary" || entry.type === "compaction") && entry.usage) {
        addUsage(totals, entry.usage);
      }
    }
  }

  /** Line 1: `~/src/app (main) • session name`, dimmed. */
  function cwdLine(terminalWidth: number): string {
    let pwd = formatCwd(ctx.cwd, process.env.HOME || process.env.USERPROFILE);
    const branch = footerData.getGitBranch();
    if (branch) pwd = `${pwd} (${branch})`;
    const sessionName = ctx.sessionManager.getSessionName();
    if (sessionName) pwd = `${pwd} • ${sessionName}`;
    return w.truncate(dim(pwd), terminalWidth, dim("..."));
  }

  /** Line 2: token/cost/context stats on the left, model + thinking on the right. */
  function statsLine(terminalWidth: number): string {
    refreshStats();
    const usage = ctx.getContextUsage();
    const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
    const percent = usage?.percent ?? null;

    const parts: string[] = [];
    if (totals.input) parts.push(`↑${formatTokens(totals.input)}`);
    if (totals.output) parts.push(`↓${formatTokens(totals.output)}`);
    if (totals.cacheRead) parts.push(`R${formatTokens(totals.cacheRead)}`);
    if (totals.cacheWrite) parts.push(`W${formatTokens(totals.cacheWrite)}`);
    if ((totals.cacheRead > 0 || totals.cacheWrite > 0) && latestCacheHitRate !== undefined) {
      parts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
    }
    if (totals.cost) parts.push(`$${totals.cost.toFixed(3)}`);

    const contextText =
      percent === null ? `?/${formatTokens(contextWindow)}` : `${percent.toFixed(1)}%/${formatTokens(contextWindow)}`;
    const contextColored =
      percent === null ? contextText : percent > 90 ? theme.fg("error", contextText) : percent > 70 ? theme.fg("warning", contextText) : contextText;
    parts.push(contextColored);

    let left = parts.join(" ");
    if (w.width(left) > terminalWidth) left = w.truncate(left, terminalWidth, "...");

    let right = ctx.model?.id ?? "no-model";
    if (ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      right = level === "off" ? `${right} • thinking off` : `${right} • ${level}`;
    }
    const leftWidth = w.width(left);
    const minPadding = 2;
    // Name the provider when more than one is available and the line has room.
    if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
      const withProvider = `(${ctx.model.provider}) ${right}`;
      if (leftWidth + minPadding + w.width(withProvider) <= terminalWidth) right = withProvider;
    }

    const rightWidth = w.width(right);
    let line: string;
    if (leftWidth + minPadding + rightWidth <= terminalWidth) {
      line = left + " ".repeat(terminalWidth - leftWidth - rightWidth) + right;
    } else {
      const available = terminalWidth - leftWidth - minPadding;
      if (available > 0) {
        const truncated = w.truncate(right, available, "");
        line = left + " ".repeat(Math.max(0, terminalWidth - leftWidth - w.width(truncated))) + truncated;
      } else {
        line = left;
      }
    }

    // Dim the two halves separately: the colored context percentage ends its own
    // ANSI run, which would otherwise clear an outer dim wrapper.
    return dim(line.slice(0, left.length)) + dim(line.slice(left.length));
  }

  /** Line 3: every other extension's statuses, as the built-in footer shows them. */
  function statusLine(terminalWidth: number): string | undefined {
    const text = [...footerData.getExtensionStatuses()]
      // Never show a stale `setStatus` copy of our own segment, which would then
      // appear both here and on the last line.
      .filter(([key]) => key !== "pi-usage")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => sanitizeStatusText(value))
      .join(" ");
    if (!text) return undefined;
    return w.truncate(text, terminalWidth, dim("..."));
  }

  const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

  return {
    render(terminalWidth: number): string[] {
      const lines = [cwdLine(terminalWidth), statsLine(terminalWidth)];
      const statuses = statusLine(terminalWidth);
      if (statuses) lines.push(statuses);

      // pi-usage always renders last, no matter how tall the footer got.
      const usage = usageLine();
      if (usage) lines.push(w.truncate(usage, terminalWidth, dim("...")));

      return lines;
    },
    invalidate() {
      // The branch comes from the data provider, which pushes changes itself.
    },
    dispose() {
      unsubscribeBranch();
      onDispose?.();
    },
  };
}
