/**
 * ZAI / GLM Coding Plan — GET {base}/api/monitor/usage/quota/limit
 *
 * The endpoint ZCode's usage panel calls (found in ZCode.app's bundle).
 * Both open.bigmodel.cn and api.z.ai serve it and accept the same key.
 *
 * Response: { code: 200, data: { level, limits: [...] } } where each limit:
 *   { type, unit, number, usage, currentValue, remaining, percentage, nextResetTime }
 * Window length is (unit, number): unit 3 + number 5 = 5h, unit 6 = weekly.
 */

import { getJson, fmtEta, pct } from "../lib/format.ts";
import type { Provider, WindowStat } from "../lib/types.ts";

const URLS = [
  "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
  "https://api.z.ai/api/monitor/usage/quota/limit",
];

function windowLabel(l: { unit?: number; number?: number }): string | null {
  if (l.unit === 3 && l.number === 5) return "5h";
  if (l.unit === 6) return "wk";
  return null; // skip unknown window shapes
}

async function fetchZai(key: string) {
  let data: any = null;
  for (const url of URLS) {
    data = await getJson(url, key);
    if (data?.data?.limits) break;
  }
  const limits = data?.data?.limits;
  if (!Array.isArray(limits) || limits.length === 0) return null;

  const windows: WindowStat[] = [];
  for (const l of limits) {
    const label = windowLabel(l);
    const percent = pct(l?.percentage);
    if (!label || percent === null) continue;
    windows.push({ label, percent, resetAt: l.nextResetTime });
  }
  if (windows.length === 0) return null;

  const level = typeof data.data.level === "string" ? data.data.level.trim() : "";
  return { windows, note: level || undefined };
}

export const zaiProvider: Provider = {
  id: "zai",
  label: "glm",
  envVar: "ZAI_API_KEY",
  fetch: fetchZai,
};

export { fmtEta };
