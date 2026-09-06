import fs from "node:fs";
import path from "node:path";

export type BotPauseState = {
  paused: boolean;
  updatedAt: string;
  reason?: string;
};

const PAUSE_FILE = () => path.resolve(process.cwd(), "data", "bot-paused.json");

let state: BotPauseState = { paused: false, updatedAt: new Date().toISOString() };

function persist(): void {
  try {
    const dir = path.resolve(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PAUSE_FILE(), JSON.stringify(state, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

/** 启动时加载；文件损坏则视为未暂停 */
export function loadBotPauseState(): BotPauseState {
  try {
    const p = PAUSE_FILE();
    if (!fs.existsSync(/* turbopackIgnore: true */ p)) return state;
    const j = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ p, "utf8"));
    state = {
      paused: Boolean(j?.paused),
      updatedAt: String(j?.updatedAt || new Date().toISOString()),
      reason: j?.reason ? String(j.reason).slice(0, 200) : undefined,
    };
  } catch {
    state = { paused: false, updatedAt: new Date().toISOString() };
  }
  return state;
}

export function getBotPauseState(): BotPauseState {
  return state;
}

export function isBotPaused(): boolean {
  return state.paused;
}

export function setBotPaused(paused: boolean, reason?: string): BotPauseState {
  state = {
    paused: Boolean(paused),
    updatedAt: new Date().toISOString(),
    reason: reason ? String(reason).slice(0, 200) : paused ? "dashboard" : undefined,
  };
  persist();
  console.log(
    `[bot-control] ${state.paused ? "PAUSED" : "RESUMED"} at ${state.updatedAt}` +
      (state.reason ? ` reason=${state.reason}` : "")
  );
  return state;
}
