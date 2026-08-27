/** API key resolution: ~/.pi/keys/<id> -> env var -> bridge.toml. */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function fromKeyFile(id: string): string | null {
  try {
    const file = join(homedir(), ".pi", "keys", id);
    if (existsSync(file)) {
      const key = readFileSync(file, "utf8").trim();
      if (key) return key;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function fromBridgeToml(provider: string): string | null {
  try {
    const candidates = [
      join(homedir(), "src", "workspace", "github", "ai-api-bridge", "bridge.toml"),
      join(homedir(), ".config", "ai-api-bridge", "bridge.toml"),
      "/etc/ai-api-bridge/bridge.toml",
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      const text = readFileSync(file, "utf8");
      // each [providers.x] section runs until the next [header]
      for (const section of text.split(/(?=^\[)/m)) {
        if (!new RegExp(`^\\[providers\\.${provider}\\]`, "m").test(section)) continue;
        const m = section.match(/^\s*api_key\s*=\s*"([^"]+)"/m);
        if (m?.[1]) return m[1];
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function resolveKey(id: string, envVar: string): string | null {
  return fromKeyFile(id) ?? process.env[envVar] ?? fromBridgeToml(id);
}
