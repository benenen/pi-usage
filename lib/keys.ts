/** API key resolution: ~/.pi/keys/<id> -> env var. */

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

export function resolveKey(id: string, envVar: string): string | null {
  return fromKeyFile(id) ?? process.env[envVar] ?? null;
}
