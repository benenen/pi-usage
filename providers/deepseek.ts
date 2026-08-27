/** DeepSeek — GET https://api.deepseek.com/user/balance (pay-as-you-go) */

import { getJson } from "../lib/format.ts";
import type { Provider } from "../lib/types.ts";

const URL_DS_BALANCE = "https://api.deepseek.com/user/balance";

async function fetchDeepseek(key: string) {
  const data = await getJson(URL_DS_BALANCE, key);
  const info = data?.balance_infos?.[0];
  if (!info) return null;
  const total = parseFloat(info.total_balance);
  if (Number.isNaN(total)) return null;
  const symbol = info.currency === "CNY" ? "¥" : `${info.currency} `;
  return { note: `${symbol}${total.toFixed(2)}` };
}

export const deepseekProvider: Provider = {
  id: "deepseek",
  label: "ds",
  envVar: "DEEPSEEK_API_KEY",
  fetch: fetchDeepseek,
};
