const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {parseTelegramSignal}=require("../workers/telegram_signal_collector");
const sql=fs.readFileSync(path.join(__dirname,"../prisma/migrations/20261118130000_add_telegram_signal_storage/migration.sql"),"utf8");
const statements=sql.replace(/--[^\n]*/g,"");

test("the production migration accepts every persisted collector field and indexes channel-scoped reads",()=>{
  const signal=parseTelegramSignal("[BTCUSDT] Binance OI +6.0%, price +4.0%",{channelUsername:"EQN_OI_Price_monitor",messageId:123,signalTime:"2026-11-18T10:00:00Z",sourceMode:"public_preview"});
  const {signal_time_source,...persisted}=signal;
  for(const key of Object.keys(persisted))assert.match(statements,new RegExp(`^\\s+${key}\\s+`,"m"),`Missing persisted ${key} column`);
  assert.match(statements,/dedupe_hash\s+text\s+PRIMARY KEY/i);
  assert.match(statements,/signal_time\s+timestamptz\s+NOT NULL/i);
  assert.match(statements,/CREATE INDEX IF NOT EXISTS telegram_signals_channel_time_idx\s+ON public\.telegram_signals \(channel_username, signal_time DESC\)/i);
  assert.match(statements,/UNIQUE INDEX IF NOT EXISTS telegram_signals_message_identity_idx/i);
  assert.match(statements,/NOTIFY pgrst, 'reload schema'/);
});

test("production signal storage is additive and denies browser roles while granting only collector operations",()=>{
  assert.match(statements,/CREATE TABLE IF NOT EXISTS public\.telegram_signals/i);
  assert.doesNotMatch(statements,/\b(?:DROP|TRUNCATE|DELETE FROM|DISABLE ROW LEVEL SECURITY)\b/i);
  assert.match(statements,/ALTER TABLE public\.telegram_signals ENABLE ROW LEVEL SECURITY/i);
  for(const role of ["PUBLIC","anon","authenticated","service_role"])assert.match(statements,new RegExp(`REVOKE ALL ON TABLE public\\.telegram_signals FROM ${role}\\s*;`,"i"));
  assert.match(statements,/^\s*BEGIN;/);assert.match(statements,/COMMIT;\s*$/);
  const grants=[...statements.matchAll(/GRANT\s+([\s\S]*?)\s+ON TABLE public\.telegram_signals TO\s+([a-z_]+)\s*;/gi)];
  assert.equal(grants.length,1);
  assert.equal(grants[0][2],"service_role");
  assert.deepEqual(grants[0][1].split(",").map(value=>value.trim().toUpperCase()),["SELECT","INSERT","UPDATE"]);
  assert.doesNotMatch(statements,/CREATE POLICY[\s\S]*?TO\s+(?:anon|authenticated|PUBLIC)\b/i);
});
