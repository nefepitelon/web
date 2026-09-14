const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/** UTC timestamps, evaluated in fixed UTC+8 (China does not observe DST). */
export function nextScheduleAt(now: number, times: string[]): string {
  const cst = new Date(now + CST_OFFSET_MS);
  const dayStart = Date.UTC(cst.getUTCFullYear(), cst.getUTCMonth(), cst.getUTCDate()) - CST_OFFSET_MS;
  const slots = [...new Set(times)].sort();
  for (let day = 0; day < 9; day++) {
    const date = dayStart + day * 86_400_000;
    const weekday = new Date(date + CST_OFFSET_MS).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (const slot of slots) {
      const match = /^(\d{2}):(\d{2})$/.exec(slot);
      if (!match || +match[1] > 23 || +match[2] > 59) continue;
      const candidate = date + (+match[1] * 60 + +match[2]) * 60_000;
      if (candidate > now + 1000) return new Date(candidate).toISOString();
    }
  }
  throw new Error("未配置有效的扫描时间");
}

export function isFreshScheduleSlot(slot: string, now: number) {
  const elapsed = now - Date.parse(slot);
  return Number.isFinite(elapsed) && elapsed >= -1000 && elapsed < 10 * 60_000;
}
