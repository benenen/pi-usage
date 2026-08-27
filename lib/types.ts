/** Shared types for usage providers. */

/** Themed UI surface handed to providers for rendering. */
export interface Theme {
  fg(color: string, text: string): string;
}

/** One usage window (e.g. 5h / weekly / monthly). */
export interface WindowStat {
  label: string;
  /** Used percent, 0-100. */
  percent: number;
  /** Epoch ms when this window resets, if the API reports it. */
  resetAt?: number;
}

/** What a provider renders into the status line, minus its label. */
export interface ProviderView {
  windows?: WindowStat[];
  /** Extra trailing note (plan level, currency balance, …). */
  note?: string;
}

export interface Provider {
  /** Short id, also used for ~/.pi/keys/<id> key lookup. */
  id: string;
  /** Label shown in the status line. */
  label: string;
  /** Env var checked for the API key. */
  envVar: string;
  /** Fetch usage and return a view, or null when unavailable. */
  fetch(key: string): Promise<ProviderView | null>;
}
