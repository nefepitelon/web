const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleFixture = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/alpha-execution/automation-baseline.ts','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText, {module:moduleFixture,exports:moduleFixture.exports,Date});
const {automationDailyRisk} = moduleFixture.exports;
const now = Date.parse('2026-09-10T01:00:00Z');
const base = {day:'2026-09-10',equity:1000,unrealized:5,income:-2,observedAt:now-600000};
function fixture(override={}) {
  return {now,equity:1000,unrealized:5,stored:base,
    income:{status:'ready',coverageComplete:true,amount:-2,assets:[],nonTradingFlows:[],
      periodStart:'2026-09-10T00:00:00Z',periodEnd:new Date(now).toISOString(),message:'fixture'},...override};
}
test('normal USDT deposits and withdrawals do not become trading PnL or enlarge daily risk capital',()=>{
  for (const [flow,equity,budget] of [[500,1500,1000],[-300,700,700]]) {
    const input=fixture({equity});
    input.income.hasNonTradingFlows=true;
    input.income.nonTradingFlows=[{asset:'USDT',amount:flow,incomeTypes:['TRANSFER','INTERNAL_TRANSFER']}];
    const result=automationDailyRisk(input);
    assert.equal(result.dailyPnl,-2);
    assert.equal(result.dayStartEquity,budget);
    assert.equal(result.created,false);
  }
});
test('cash-flow neutral unrealized losses and settled day losses remain binding across restart',()=>{
  const input=fixture({equity:1490,unrealized:-5});
  input.income.nonTradingFlows=[{asset:'USDT',amount:500,incomeTypes:['TRANSFER']}];
  assert.equal(automationDailyRisk(input).dailyPnl,-10);
  input.income.amount=-20;
  assert.equal(automationDailyRisk(input).dailyPnl,-28);
  const restart=automationDailyRisk(input);
  assert.equal(restart.baseline,base);
  assert.equal(restart.dayStartEquity,1000);
});
test('incomplete windows, non-USDT costs, unknown adjustments, stale data and invalid stored baselines fail closed',()=>{
  const changes=[
    income=>income.status='partial',income=>income.coverageComplete=false,income=>income.amount=NaN,
    income=>income.assets=[{asset:'BNB',recordCount:1}],
    income=>income.nonTradingFlows=[{asset:'USDT',amount:-100,incomeTypes:['INSURANCE_CLEAR']}],
    income=>income.nonTradingFlows=[{asset:'USDT',amount:0,incomeTypes:['UNKNOWN_ADJUSTMENT']}],
    income=>income.nonTradingFlows=[{asset:'BTC',amount:1,incomeTypes:['TRANSFER']}],
    income=>income.periodStart='2026-09-09T00:00:00Z',
    income=>income.periodEnd=new Date(now-60001).toISOString(),
    income=>income.periodEnd=new Date(now+1).toISOString(),
  ];
  for(const change of changes){const input=fixture();change(input.income);assert.throws(()=>automationDailyRisk(input));}
  for(const stored of [{...base,equity:NaN},{...base,income:null},{...base,observedAt:now+1}])
    assert.throws(()=>automationDailyRisk(fixture({stored})));
});
test('first observation preserves settled losses and midnight turnover establishes a new dated baseline',()=>{
  for(const stored of [null,{...base,day:'2026-09-09'}]){
    const result=automationDailyRisk(fixture({stored}));
    assert.equal(result.created,true);
    assert.equal(result.baseline.day,'2026-09-10');
    assert.equal(result.dailyPnl,-2);
  }
});
