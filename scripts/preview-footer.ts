/**
 * Render the pi-usage footer without pi.
 *
 * Builds a fake extension context (session entries with usage, a couple of
 * other extensions' statuses) and prints the footer at several widths, so the
 * layout — pwd / stats / other statuses / pi-usage last — can be eyeballed
 * without starting pi.
 *
 * Run: node scripts/preview-footer.ts
 */

import { createFooter, formatTokens, formatCwd, sanitizeStatusText } from "../lib/footer.ts";

const esc = (code: string) => (text: string) => `\x1b[${code}m${text}\x1b[0m`;
const ansiRe = /\x1b\[[0-9;]*m/g;

const theme = {
  fg(color: string, text: string): string {
    switch (color) {
      case "dim":
        return esc("2")(text);
      case "accent":
        return esc("38;5;39")(text);
      case "success":
        return esc("32")(text);
      case "warning":
        return esc("33")(text);
      case "error":
        return esc("31")(text);
      default:
        return text;
    }
  },
};

/** Enough for the preview: drop ANSI, count CJK/emoji as two columns. */
const width = (text: string): number => {
  let total = 0;
  for (const char of text.replace(ansiRe, "")) {
    const code = char.codePointAt(0) ?? 0;
    total += (code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0x1f300 && code <= 0x1faff) ? 2 : 1;
  }
  return total;
};

/** Naive ANSI-aware truncate; good enough to show where pi would clip. */
const truncate = (text: string, maxWidth: number, ellipsis = ""): string => {
  if (width(text) <= maxWidth) return text;
  const budget = maxWidth - width(ellipsis);
  let out = "";
  let used = 0;
  let open = "";
  for (let i = 0; i < text.length; ) {
    const ansi = /^\x1b\[[0-9;]*m/.exec(text.slice(i));
    if (ansi) {
      out += ansi[0];
      open = ansi[0] === "\x1b[0m" ? "" : ansi[0];
      i += ansi[0].length;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i)!);
    const cost = width(char);
    if (used + cost > budget) break;
    out += char;
    used += cost;
    i += char.length;
  }
  return out + (open ? "\x1b[0m" : "") + ellipsis;
};

const usage = (input: number, output: number, cacheRead: number, cacheWrite: number, cost: number) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
});

const entries = [
  { type: "message", message: { role: "user", content: "hello" } },
  { type: "message", message: { role: "assistant", usage: usage(1800, 400, 118_000, 6_000, 0.284) } },
  { type: "message", message: { role: "toolResult", usage: usage(300, 120, 0, 0, 0.012) } },
  { type: "message", message: { role: "assistant", usage: usage(2400, 900, 132_000, 2_000, 0.116) } },
];

const ctx = {
  cwd: `${process.env.HOME}/src/workspace/github/pi-usage`,
  model: { id: "claude-sonnet-4-5", provider: "anthropic", contextWindow: 200_000, reasoning: true },
  thinkingLevel: "low",
  getContextUsage: () => ({ contextWindow: 200_000, percent: 41.2 }),
  sessionManager: {
    getEntries: () => entries,
    getSessionId: () => "preview-session",
    getLeafId: () => "leaf-4",
    getSessionName: () => "pi-usage footer",
  },
};

const footerData = {
  getGitBranch: () => "main",
  getExtensionStatuses: () =>
    new Map([
      ["billion-context-pi", "ctx 41%"],
      ["goal", "goal: ship footer takeover"],
      ["pi-lens-lsp", "LSP Inactive"],
      ["pi-usage", "☁ stale copy that must not show up twice"],
      ["subagent-slash", "1 subagent"],
    ]),
  getAvailableProviderCount: () => 4,
  onBranchChange: () => () => {},
};

const usageLine = () => theme.fg("dim", "☁ ") + theme.fg("accent", "go") + theme.fg("dim", " ") + theme.fg("success", "5h 1%") + theme.fg("dim", " | ") + theme.fg("success", "wk 10%") + theme.fg("dim", " | ") + theme.fg("success", "mo 6%") + theme.fg("dim", " | ") + theme.fg("dim", "reset 3h56m");

const footer = createFooter({
  ctx: ctx as any,
  theme,
  footerData: footerData as any,
  tui: { requestRender() {} },
  width: { width, truncate },
  usageLine,
});

for (const terminalWidth of [200, 96, 58, 30]) {
  const lines = footer.render(terminalWidth);
  const last = lines.at(-1) ?? "";
  console.log(`\n${"=".repeat(30)} width ${terminalWidth} → ${lines.length} lines`);
  lines.forEach((line, i) => {
    const mark = i === lines.length - 1 ? "└" : "├";
    const plain = line.replace(ansiRe, "");
    console.log(`${mark} [${String(width(line)).padStart(3)}] ${line}\x1b[0m`);
    console.log(`${mark}       plain: ${plain}`);
  });
  console.log(`  last line is pi-usage: ${last.replace(ansiRe, "").includes("☁ go")}  (len ${width(last)})`);

  // Every line the footer hands to pi must fit the terminal.
  const overflow = lines.filter((line) => width(line) > terminalWidth);
  console.log(`  lines over width: ${overflow.length}`);
}

// Without usage data the line disappears instead of rendering empty.
const hidden = createFooter({
  ctx: ctx as any,
  theme,
  footerData: footerData as any,
  tui: { requestRender() {} },
  width: { width, truncate },
  usageLine: () => undefined,
});
const hiddenLines = hidden.render(96);
console.log(`\nno usage data → ${hiddenLines.length} lines, last = ${JSON.stringify(hiddenLines.at(-1)?.replace(ansiRe, ""))}`);

console.log(`\nformatTokens: ${[0, 999, 1234, 12_345, 999_999, 1_234_567, 12_345_678].map(formatTokens).join(" ")}`);
console.log(`formatCwd: ${formatCwd("/tmp/elsewhere", process.env.HOME)} | ${formatCwd(process.env.HOME!, process.env.HOME)}`);
console.log(`sanitizeStatusText: ${JSON.stringify(sanitizeStatusText("a\nb\t\tc   d "))}`);
