import "server-only";
import { z } from "zod";
import { alphaAutomationSettingsSchema, DEFAULT_ALPHA_AUTOMATION_SETTINGS,
  type AlphaAutomationAccount, type AlphaAutomationSettings } from "./automation-strategy";
import { loadAlphaAutomationMarket, type AlphaAutomationMarketResult } from "./automation-market";

type ExecutionCaps = { perOrderNotionalLimit:number; maxLeverage:number; maxOpenPositions:number;
  maxPortfolioExposurePct:number; riskPerTradePct:number; dailyLossLimitPct:number; minAlphaScore:number;
  dedupeWindowMinutes:number; dailyNotionalLimit:number };
type AccountResult = {account:AlphaAutomationAccount;execution:ExecutionCaps};
type Completion = {text:string;model:string;provider:string};
type Dependencies = {
  now?:()=>number;
  loadAccount?:(userId:string)=>Promise<AccountResult>;
  loadMarket?:(settings:AlphaAutomationSettings)=>Promise<AlphaAutomationMarketResult>;
  complete?:(input:{system:string;prompt:string;schema:Record<string,unknown>})=>Promise<Completion>;
  completionTimeoutMs?:number;
};
const adjustableKeys = ["intervalMinutes","minOrderGapMinutes","orderNotional","leverage","maxPositions",
  "maxPortfolioNotional","riskPerTradePct","minScore","maxHoldingMinutes","dailyLossLimitPct"] as const;
type AdjustableKey = typeof adjustableKeys[number];
const evidenceKeys = ["account_budget","execution_caps","data_quality","market_volatility","liquidity"] as const;
const numbers = Object.fromEntries(adjustableKeys.map(key=>[key,z.number().finite()])) as Record<AdjustableKey,z.ZodNumber>;
const outputSchema = z.object({
  adjustments:z.object(numbers).strict(),
  summary:z.string().min(1).max(240),
  reasons:z.array(z.object({field:z.enum(adjustableKeys),evidence:z.enum(evidenceKeys),reason:z.string().min(1).max(240)}).strict()).min(1).max(10),
}).strict();
const providerJsonSchema = {type:"object",additionalProperties:false,required:["adjustments","summary","reasons"],properties:{
  adjustments:{type:"object",additionalProperties:false,required:[...adjustableKeys],properties:Object.fromEntries(adjustableKeys.map(key=>[key,{type:"number"}]))},
  summary:{type:"string"},reasons:{type:"array",items:{type:"object",additionalProperties:false,required:["field","evidence","reason"],
    properties:{field:{type:"string",enum:[...adjustableKeys]},evidence:{type:"string",enum:[...evidenceKeys]},reason:{type:"string"}}}},
}};
type Reason = {field:string;evidence:string;reason:string};
type DiagnosticStage = "provider"|"response_text"|"json_parse"|"output_schema"|"settings_schema"|"risk_caps"|"evidence"|"narrative"|"risk_budget";
type RecommendationDiagnostic = {stage:DiagnosticStage;code:string;httpStatus?:number;providerCode?:string;incompleteReason?:string;validationFields?:string[]};
class RecommendationFailure extends Error {
  constructor(readonly diagnostic:RecommendationDiagnostic){super(diagnostic.code);}
}
const providerCodes=new Set(["model_not_found","model_not_supported","insufficient_quota","invalid_api_key","permission_denied",
  "rate_limit_exceeded","context_length_exceeded","unsupported_parameter","unsupported_value","invalid_json_schema",
  "invalid_request_error","server_error","content_filter","billing_hard_limit_reached","account_deactivated","authentication_error"]);
function providerFailure(code:string,details:Omit<RecommendationDiagnostic,"stage"|"code">={}):never {
  throw new RecommendationFailure({stage:"provider",code,...details});
}
function providerHttpFailure(status:number,code:unknown):never {
  return providerFailure(`provider_http_${status}`,{httpStatus:status,...(typeof code==="string"&&providerCodes.has(code)?{providerCode:code}:{})});
}
function networkFailure(error:unknown):never {
  const value=error as {name?:unknown;message?:unknown;code?:unknown;cause?:{code?:unknown}};
  if(value?.name==="AbortError"||value?.name==="TimeoutError")return providerFailure("provider_timeout");
  // The shared provider uses human-readable HTTP errors. Extract only a three-digit
  // status; never return, log or embed the surrounding message.
  const status=typeof value?.message==="string"?/\bHTTP\s+([45]\d{2})\b/.exec(value.message):null;
  if(status)return providerHttpFailure(Number(status[1]),value.code);
  return providerFailure("provider_network_error");
}
function diagnosticMessage(diagnostic:RecommendationDiagnostic):string {
  if(diagnostic.code==="provider_not_configured")return "服务端尚未配置 AI 服务。";
  if(diagnostic.code==="provider_timeout")return "AI 服务本次响应超时。";
  if(diagnostic.httpStatus)return `AI 服务返回 HTTP ${diagnostic.httpStatus}${diagnostic.providerCode?`（${diagnostic.providerCode}）`:""}。`;
  if(diagnostic.code==="provider_incomplete")return `AI 输出未完成${diagnostic.incompleteReason?`（${diagnostic.incompleteReason}）`:""}。`;
  if(diagnostic.code==="provider_refused")return "AI 服务未返回可用的参数建议。";
  const messages:Record<DiagnosticStage,string>={provider:"AI 服务连接或返回结果异常。",response_text:"AI 未返回有效的结构化文本。",
    json_parse:"AI 返回内容不是合法 JSON。",output_schema:"AI 返回字段或理由格式不符合约定。",settings_schema:"AI 参数超出可表达范围或字段组合无效。",
    risk_caps:"AI 参数试图放宽现有风险限制。",evidence:"AI 理由引用了本轮不存在的数据。",narrative:"AI 理由包含不允许的承诺或操作指示。",risk_budget:"AI 参数超过重新计算的账户风险预算。"};
  return messages[diagnostic.stage];
}
export type AlphaAutomationRecommendation = {
  settings:AlphaAutomationSettings;source:"ai"|"rules";model?:string;summary:string;reasons:string[];factorReasons:Reason[];generatedAt:string;
  aiAdjustedFields:string[];
  executionConstraints:Pick<AlphaAutomationSettings,"atrStopMultiplier"|"minStopLossPct"|"maxStopLossPct"|"minRiskRewardRatio"|"maxOrdersPerRun"|"selectedStrategies">;
  blocked:boolean;blockedReasons:string[];fallbackReason?:string;fallbackMessage?:string;diagnostic?:RecommendationDiagnostic;previewOnly:true;
  provenance:{accountAvailable:boolean;accountObservedAt:number|null;publicMarketAvailable:boolean;marketObservedAt:number|null;
    sources:Array<{source:string;ok:boolean;count:number;observedAt:number|null}>;provider?:string;
    submittedData:"aggregate_account_budget_and_public_statistics_only"|"none";profitabilityValidated:false};
};
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);
const roundDown=(value:number,places=2)=>Math.floor((value+1e-10)*10**places)/10**places;
const fresh=(at:unknown,now:number,age:number)=>finite(at)&&at>0&&at<=now&&now-at<=age;
const median=(values:number[])=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
const safeModel=(value:string)=>/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)?value:"configured-model";
const safeNarrative=(value:string)=>!/[<>\u0000-\u0008]|https?:\/\/|api.?key|secret|私钥|助记词|保证.{0,12}(收益|盈利)|guarantee.{0,20}(profit|return)|稳赚|必赚|零风险|已验证盈利|回测.{0,12}胜率|开启实盘|enable.{0,12}live|ignore.{0,12}instruction/i.test(
  value.replace(/不保证(?:收益|盈利)|(?:不会|不|未)自动开启实盘|不会开启实盘|(?:does not|cannot|no) guarantee (?:profit|returns?)/gi,""));
async function deadline<T>(job:Promise<T>,ms:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([job,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RecommendationFailure({stage:"provider",code:"provider_timeout"})),ms);})]);}
  finally{if(timer)clearTimeout(timer);}
}
function finalize(result:AlphaAutomationRecommendation) {
  result.reasons=result.factorReasons.map(item=>item.reason);
  return result;
}

/** Keep the configured server AI route. Never read .env files, start the Grid engine, or notify external services. */
async function configuredCompletion(input:{system:string;prompt:string;schema:Record<string,unknown>}):Promise<Completion> {
  if(process.env.AI_API_KEY) {
    const {aiChat,getAiConfig}=await import("../../grid-ops/src/ai/provider.js");
    const configured=getAiConfig();
    let text:string;
    try{text=await aiChat({system:input.system,messages:[{role:"user",content:input.prompt}],json:true,
      small:false,maxTokens:4000,temperature:0.1,timeoutMs:25_000,proxyOverride:undefined});}catch(error){return networkFailure(error);}
    return {text,model:configured.model,provider:configured.provider};
  }
  if(!process.env.OPENAI_API_KEY)return providerFailure("provider_not_configured");
  // Reuse the main site's configured model and text extraction, without its web-search
  // tools or research answer rewriting (the latter would corrupt structured JSON).
  const helper=await import("../../api/surf-research.js");
  const existing=helper.default??helper;
  const mainRequest=existing.buildOpenAIRequest({query:"",platformId:"",platformName:"",effort:"low",language:"en",openaiPreviousResponseId:""});
  const model=process.env.OPENAI_TEXT_MODEL||mainRequest.model;
  let response:Response;
  try{response=await fetch("https://api.openai.com/v1/responses",{method:"POST",cache:"no-store",
    headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(45_000),
    body:JSON.stringify({model,store:false,instructions:input.system,input:input.prompt,max_output_tokens:4000,
      ...(/^(?:gpt-[56]|o[1-9])/i.test(model)?{reasoning:{effort:mainRequest.reasoning?.effort??"low"}}:{}),
      text:{format:{type:"json_schema",name:"alpha_automation_recommendation",strict:true,schema:input.schema}}})});}catch(error){return networkFailure(error);}
  let text:string;
  try{text=await response.text();}catch(error){return networkFailure(error);}
  if(text.length>150_000)return providerFailure("provider_response_too_large");
  let payload:any;
  try{payload=JSON.parse(text);}catch{if(!response.ok)return providerHttpFailure(response.status,undefined);return providerFailure("provider_invalid_json");}
  if(!response.ok)return providerHttpFailure(response.status,payload?.error?.code);
  if(payload.status!=="completed")return providerFailure("provider_incomplete",{
    ...(["max_output_tokens","content_filter"].includes(payload?.incomplete_details?.reason)?{incompleteReason:payload.incomplete_details.reason}:{})});
  if(Array.isArray(payload.output)&&payload.output.some((item:any)=>Array.isArray(item?.content)&&item.content.some((content:any)=>content?.type==="refusal")))return providerFailure("provider_refused");
  return {text:existing.extractText(payload),model:String(payload.model||model),provider:"openai"};
}

function conservativeBase(current:AlphaAutomationSettings):AlphaAutomationSettings {
  const result={...current,enabled:false,maxOrdersPerRun:1};
  const lower=["intervalMinutes","minOrderGapMinutes","minScore","minQuoteVolume24h","minRiskRewardRatio"] as const;
  const upper=["sessionDurationHours","orderNotional","maxOrderNotional","leverage","maxPositions","maxPortfolioNotional","maxPortfolioEquityPct",
    "riskPerTradePct","maxDataAgeMinutes","maxQuoteAgeSeconds","maxSpreadPct","maxSlippagePct","maxStopLossPct","maxHoldingMinutes",
    "dailyLossLimitPct"] as const;
  for(const key of lower)result[key]=Math.max(current[key],DEFAULT_ALPHA_AUTOMATION_SETTINGS[key]);
  for(const key of upper)result[key]=Math.min(current[key],DEFAULT_ALPHA_AUTOMATION_SETTINGS[key]);
  result.minStopLossPct=Math.min(result.maxStopLossPct,Math.max(current.minStopLossPct,DEFAULT_ALPHA_AUTOMATION_SETTINGS.minStopLossPct));
  result.orderNotional=Math.min(result.orderNotional,result.maxOrderNotional,result.maxPortfolioNotional);
  return alphaAutomationSettingsSchema.parse(result);
}

function accountUsable(value:AccountResult,now:number):boolean {
  const a=value?.account,e=value?.execution;
  return Boolean(a&&e&&fresh(a.observedAt,now,60_000)&&finite(a.equity)&&a.equity>0&&finite(a.dayStartEquity)&&a.dayStartEquity>0
    &&finite(a.dailyPnl)&&finite(a.availableMargin)&&a.availableMargin>=0&&typeof a.killSwitch==="boolean"&&typeof a.unresolvedOrders==="boolean"
    &&typeof a.reconciliationHealthy==="boolean"&&Array.isArray(a.openPositions)&&Array.isArray(a.pendingEntries)
    &&[...a.openPositions,...a.pendingEntries].every(row=>finite(row.notional)&&row.notional>0)
    &&[e.perOrderNotionalLimit,e.maxLeverage,e.maxOpenPositions,e.maxPortfolioExposurePct,e.riskPerTradePct,e.dailyLossLimitPct,e.minAlphaScore,e.dedupeWindowMinutes,e.dailyNotionalLimit].every(value=>finite(value)&&value>0));
}

function publicStats(result:AlphaAutomationMarketResult,now:number,settings:AlphaAutomationSettings) {
  const allowed=new Set(["anomaly","momentum","signal","risk_pool","market"]);
  const sources=(Array.isArray(result?.sourceStatus)?result.sourceStatus:[]).filter(row=>row&&allowed.has(row.source)).map(row=>({source:row.source,ok:row.ok===true,
    count:Number.isInteger(row.count)&&row.count>=0?row.count:0,observedAt:finite(row.observedAt)?row.observedAt:null}));
  const observations=(Array.isArray(result?.observations)?result.observations:[]).filter(row=>row?.dataComplete&&fresh(row.snapshotAt??row.observedAt,now,settings.maxDataAgeMinutes*60_000));
  const observationTimes=observations.map(row=>row.snapshotAt??row.observedAt).filter(finite);
  const markets=(Array.isArray(result?.markets)?result.markets:[]).filter(row=>row?.market==="futures"&&row.tradable&&fresh(row.observedAt,now,settings.maxDataAgeMinutes*60_000)
    &&fresh(row.quoteAt,now,settings.maxQuoteAgeSeconds*1000)&&[row.bid,row.ask,row.atrPct,row.quoteVolume24h,row.estimatedSlippagePct,row.filters?.minNotional,row.filters?.minQty].every(value=>finite(value)&&value>=0)&&row.bid>0&&row.ask>=row.bid);
  return {sources,available:observations.length>0||markets.length>0,observedAt:observationTimes.length||markets.length?Math.max(...observationTimes,...markets.map(row=>row.observedAt)):null,
    markets,aggregate:{freshEvidenceCount:observations.length,qualifiedMarketCount:markets.length,
      medianAtrPct:median(markets.map(row=>row.atrPct)),medianSpreadPct:median(markets.map(row=>(row.ask-row.bid)/((row.ask+row.bid)/2)*100)),
      medianQuoteVolume24h:median(markets.map(row=>row.quoteVolume24h)),medianEstimatedSlippagePct:median(markets.map(row=>row.estimatedSlippagePct)),
      overheatingCount:observations.filter(row=>row.overheated).length}};
}

export function createAlphaAutomationRecommender(deps:Dependencies={}) {
  const clock=deps.now??Date.now;
  return async function recommend(userId:string,input:AlphaAutomationSettings=DEFAULT_ALPHA_AUTOMATION_SETTINGS):Promise<AlphaAutomationRecommendation> {
    const current=alphaAutomationSettingsSchema.parse(input),base=conservativeBase(current);
    const [accountResult,marketResult]=await Promise.allSettled([
      deps.loadAccount?deps.loadAccount(userId):import("./automation-account").then(module=>module.loadAutomationAccount(userId)),
      (deps.loadMarket??loadAlphaAutomationMarket)(base),
    ]);
    const now=clock(),publicData=marketResult.status==="fulfilled"?publicStats(marketResult.value,now,base):null;
    const usable=accountResult.status==="fulfilled"&&accountUsable(accountResult.value,now);
    const reasons:Reason[]=[{field:"enabled",evidence:"execution_caps",reason:"仅生成待人工确认的参数草稿，保持关闭；这些阈值未经盈利验证。"},
      {field:"intervalMinutes",evidence:"execution_caps",reason:`建议至少每 ${base.intervalMinutes} 分钟筛选一次，并保持每轮最多 1 单。`}];
    const result:AlphaAutomationRecommendation={settings:base,source:"rules",summary:"已按保守规则生成参数草稿，尚未保存或启动。",reasons:[],factorReasons:reasons,aiAdjustedFields:[],
      executionConstraints:{atrStopMultiplier:base.atrStopMultiplier,minStopLossPct:base.minStopLossPct,maxStopLossPct:base.maxStopLossPct,
        minRiskRewardRatio:base.minRiskRewardRatio,maxOrdersPerRun:base.maxOrdersPerRun,selectedStrategies:[...base.selectedStrategies]},
      generatedAt:new Date(now).toISOString(),blocked:false,blockedReasons:[],previewOnly:true,
      provenance:{accountAvailable:usable,accountObservedAt:usable?(accountResult as PromiseFulfilledResult<AccountResult>).value.account.observedAt:null,
        publicMarketAvailable:publicData?.available??false,marketObservedAt:publicData?.observedAt??null,sources:publicData?.sources??[],
        submittedData:"none",profitabilityValidated:false}};
    if(!usable) {
      result.blocked=true;result.blockedReasons.push("ACCOUNT_OR_EXECUTION_CAPS_UNAVAILABLE");result.fallbackReason="ACCOUNT_UNAVAILABLE";
      result.summary="账户风险快照或现行执行限额暂不可核验，仅显示保守模板，暂不可据此执行。";
      reasons.push({field:"orderNotional",evidence:"account_budget",reason:"未读取到完整账户预算；没有把缺失余额当作零，也没有让模型猜测可用资金。"});
      return finalize(result);
    }
    const {account:a,execution:e}=(accountResult as PromiseFulfilledResult<AccountResult>).value;
    base.maxOrderNotional=Math.min(base.maxOrderNotional,e.perOrderNotionalLimit,e.dailyNotionalLimit);
    base.leverage=Math.min(base.leverage,e.maxLeverage);
    base.maxPositions=Math.min(base.maxPositions,e.maxOpenPositions);
    base.maxPortfolioEquityPct=Math.min(base.maxPortfolioEquityPct,e.maxPortfolioExposurePct);
    base.maxPortfolioNotional=Math.min(base.maxPortfolioNotional,e.dailyNotionalLimit);
    base.riskPerTradePct=Math.min(base.riskPerTradePct,e.riskPerTradePct);
    base.dailyLossLimitPct=Math.min(base.dailyLossLimitPct,e.dailyLossLimitPct);
    base.minScore=Math.max(base.minScore,e.minAlphaScore);
    base.minOrderGapMinutes=Math.max(base.minOrderGapMinutes,e.dedupeWindowMinutes);
    const exposed=[...a.openPositions,...a.pendingEntries].reduce((sum,row)=>sum+row.notional,0);
    const capacity=Math.max(0,Math.min(base.maxPortfolioNotional,a.equity*base.maxPortfolioEquityPct/100)-exposed);
    // Reserve the maximum permitted spread/slippage and both 0.06% fee estimates,
    // rather than claiming a known fee tier or guaranteed stop fill.
    const costPct=2*(0.06+base.maxSlippagePct)+base.maxSpreadPct;
    const budget=roundDown(Math.min(base.orderNotional,base.maxOrderNotional,capacity,
      a.availableMargin/(1/base.leverage+costPct/100),a.equity*base.riskPerTradePct/(base.maxStopLossPct+costPct)));
    // Values below schema minima cannot be rounded up into a tradable proposal.
    if(base.maxOrderNotional<5||base.maxPortfolioNotional<5||base.riskPerTradePct<0.01||base.dailyLossLimitPct<0.25||base.leverage<1||base.maxPositions<1
      ||base.minScore>95||base.minOrderGapMinutes>1440||base.maxPortfolioEquityPct<1)
      throw new Error("现行执行限额低于参数模板可表达范围，无法生成不越限的建议；请保留关闭状态。");
    base.orderNotional=Math.min(base.orderNotional,base.maxOrderNotional,base.maxPortfolioNotional);
    if(budget>=5)base.orderNotional=budget;
    else result.blockedReasons.push("INSUFFICIENT_SAFE_BUDGET");
    if(a.killSwitch||a.unresolvedOrders||!a.reconciliationHealthy)result.blockedReasons.push("ACCOUNT_RECONCILIATION_REQUIRED");
    if(a.dailyPnl<=-a.dayStartEquity*base.dailyLossLimitPct/100)result.blockedReasons.push("DAILY_LOSS_LIMIT");
    if(a.openPositions.length+a.pendingEntries.length>=base.maxPositions)result.blockedReasons.push("POSITION_LIMIT");
    if(!publicData?.available)result.blockedReasons.push("PUBLIC_MARKET_UNAVAILABLE");
    const viable=publicData?.markets.filter(row=>{
      const min=Math.max(row.filters.minNotional,row.filters.minQty*row.ask,5);
      return finite(min)&&min<=budget&&min<=base.maxOrderNotional;
    })??[];
    if(!viable.length)result.blockedReasons.push(publicData?.markets.length?"BELOW_CURRENT_EXCHANGE_MINIMUM":"NO_VERIFIED_EXECUTABLE_MARKET");
    result.settings=alphaAutomationSettingsSchema.parse(base);
    result.blocked=result.blockedReasons.length>0;
    reasons.push({field:"orderNotional",evidence:"account_budget",reason:`权益 ${roundDown(a.equity)} USDT，可用保证金 ${roundDown(a.availableMargin)} USDT；扣除组合占用并预留成本后，本轮安全预算 ${budget} USDT。`},
      {field:"maxPortfolioNotional",evidence:"execution_caps",reason:`组合上限取 ${base.maxPortfolioNotional} USDT 与权益 ${base.maxPortfolioEquityPct}% 的较小值，保留更严格的现行管理员限额。`},
      {field:"minScore",evidence:"data_quality",reason:`公开来源当前有 ${publicData?.aggregate.freshEvidenceCount??0} 条新鲜完整证据、${viable.length} 个已核验金额可行市场；缺项不补演示数据。`},
      {field:"atrStopMultiplier",evidence:publicData?.markets.length?"market_volatility":"data_quality",reason:publicData?.aggregate.medianAtrPct!=null
        ?`可用市场闭合K线 ATR 中位数为 ${roundDown(publicData.aggregate.medianAtrPct,3)}%；止损沿用 ${base.atrStopMultiplier} 倍 ATR、${base.minStopLossPct}–${base.maxStopLossPct}% 边界，过宽则拒绝。`
        :`尚无可用闭合K线 ATR，未作波动校准；保留 ${base.atrStopMultiplier} 倍 ATR、${base.minStopLossPct}–${base.maxStopLossPct}% 规则，执行时必须补齐真实数据。`},
      {field:"minRiskRewardRatio",evidence:"execution_caps",reason:`执行层要求扣除双边费用与滑点预留后至少 ${base.minRiskRewardRatio}R；0.06% 单边费用是保守估计，止损不保证成交价。AI不能放宽这些保护规则。`});
    if(!publicData?.available) {result.fallbackReason="PUBLIC_MARKET_UNAVAILABLE";result.summary="公开行情暂不足，返回账户限额内的规则草稿，等待真实数据恢复。";return finalize(result);}
    const allowedEvidence=["account_budget","execution_caps","data_quality",...(publicData.markets.length?["market_volatility","liquidity"]:[])];
    const adjustmentBounds:Record<AdjustableKey,{type:"integer"|"number";minimum:number;maximum:number}>={
      intervalMinutes:{type:"integer",minimum:base.intervalMinutes,maximum:240},
      minOrderGapMinutes:{type:"integer",minimum:base.minOrderGapMinutes,maximum:1440},
      orderNotional:{type:"number",minimum:5,maximum:base.orderNotional},
      leverage:{type:"integer",minimum:1,maximum:base.leverage},
      maxPositions:{type:"integer",minimum:1,maximum:base.maxPositions},
      maxPortfolioNotional:{type:"number",minimum:5,maximum:base.maxPortfolioNotional},
      riskPerTradePct:{type:"number",minimum:0.01,maximum:base.riskPerTradePct},
      minScore:{type:"number",minimum:base.minScore,maximum:95},
      maxHoldingMinutes:{type:"integer",minimum:15,maximum:base.maxHoldingMinutes},
      dailyLossLimitPct:{type:"number",minimum:0.25,maximum:base.dailyLossLimitPct},
    };
    const requestSchema=JSON.parse(JSON.stringify(providerJsonSchema));
    requestSchema.properties.adjustments.properties=adjustmentBounds;
    requestSchema.properties.reasons.items.properties.evidence.enum=allowedEvidence;
    requestSchema.properties.summary.maxLength=240;
    requestSchema.properties.reasons.minItems=1;
    requestSchema.properties.reasons.maxItems=10;
    requestSchema.properties.reasons.items.properties.reason.maxLength=240;
    const aggregates={account:{equity:roundDown(a.equity),availableMargin:roundDown(a.availableMargin),openPositionCount:a.openPositions.length,
      pendingEntryCount:a.pendingEntries.length,occupiedNotional:roundDown(exposed),safeOrderBudget:budget,remainingPortfolioBudget:roundDown(capacity),
      dailyLossBudgetRemaining:roundDown(Math.max(0,a.dayStartEquity*base.dailyLossLimitPct/100+Math.min(a.dailyPnl,0)))},
      publicMarket:publicData.aggregate,sourceStatus:publicData.sources,conservativeSettings:result.settings,
      executionCeilings:{perOrderNotional:base.maxOrderNotional,maxLeverage:base.leverage,maxPositions:base.maxPositions,maxPortfolioNotional:base.maxPortfolioNotional,
        riskPerTradePct:base.riskPerTradePct,dailyLossLimitPct:base.dailyLossLimitPct},blockedReasons:result.blockedReasons,
      allowedEvidence,adjustmentBounds,draftOnlyWhenBlocked:true,
      budgetInstruction:budget<5?"当前预算不足以开仓。仍需返回schema允许的非执行参数草稿（orderNotional最低5），不可输出0或提高风险权限；说明等待释放现有占用。系统会持续保留blocked，不会执行。":"订单目标必须同时符合账户预算和参数上限；降低风险预算时应相应降低订单目标。"};
    const system="你是交易参数研究助手，只生成待人工确认的 JSON 草稿，不执行、保存或启动任何交易。输入仅为已验证聚合预算与公开统计，不包含身份、凭据或账户流水。不得猜测缺失数据，不得声称盈利验证、保证收益或提高现行风险权限。只能调整指定数值字段：intervalMinutes/minOrderGapMinutes/minScore可保持或提高，其余只能保持或降低conservativeSettings。严格遵守adjustmentBounds且返回全部10个adjustments字段；schema以外不要增加enabled或任何字段。至少15分钟扫描、1单每轮，系统保持关闭。理由evidence只能来自allowedEvidence；缺少ATR或盘口数据时必须用data_quality说明缺项，禁止使用market_volatility或liquidity。遵守budgetInstruction；预算为0时不能把参数写成0，不能靠增加组合/风险上限消除blocked。summary及每条reason不超过240字，写简洁中文。不可要求密钥、私钥或提供链接。输出严格符合指定JSON schema。";
    let stage:DiagnosticStage="provider";
    try {
      result.provenance.submittedData="aggregate_account_budget_and_public_statistics_only";
      const answer=await deadline((deps.complete??configuredCompletion)({system,prompt:JSON.stringify({data:aggregates,outputSchema:requestSchema}),schema:requestSchema}),Math.max(1,Math.min(deps.completionTimeoutMs??55_000,55_000)));
      stage="response_text";
      if(typeof answer.text!=="string"||answer.text.length>16_000)throw new Error("AI_RESPONSE_INVALID");
      stage="json_parse";
      const decoded=JSON.parse(answer.text);
      stage="output_schema";
      const parsed=outputSchema.parse(decoded);
      stage="settings_schema";
      const adjusted=alphaAutomationSettingsSchema.parse({...result.settings,...parsed.adjustments,enabled:false});
      stage="risk_caps";
      for(const key of adjustableKeys) {
        const increasing=key==="intervalMinutes"||key==="minOrderGapMinutes"||key==="minScore";
        if(increasing?adjusted[key]<result.settings[key]:adjusted[key]>result.settings[key])throw new Error("AI_EXCEEDED_CAPS");
      }
      stage="evidence";
      const validEvidence=new Set<string>(allowedEvidence);
      if(parsed.reasons.some(row=>!validEvidence.has(row.evidence)))throw new Error("AI_UNSUPPORTED_REASON");
      stage="narrative";
      if(!safeNarrative(parsed.summary)||parsed.reasons.some(row=>!safeNarrative(row.reason)))throw new Error("AI_UNSUPPORTED_REASON");
      stage="risk_budget";
      const adjustedBudget=roundDown(Math.min(adjusted.maxOrderNotional,Math.max(0,Math.min(adjusted.maxPortfolioNotional,a.equity*adjusted.maxPortfolioEquityPct/100)-exposed),
        a.availableMargin/(1/adjusted.leverage+costPct/100),a.equity*adjusted.riskPerTradePct/(adjusted.maxStopLossPct+costPct)));
      if(budget>=5&&adjusted.orderNotional>adjustedBudget)throw new Error("AI_EXCEEDED_RISK_BUDGET");
      if(adjustedBudget<5&&!result.blockedReasons.includes("INSUFFICIENT_SAFE_BUDGET"))result.blockedReasons.push("INSUFFICIENT_SAFE_BUDGET");
      if(a.openPositions.length+a.pendingEntries.length>=adjusted.maxPositions&&!result.blockedReasons.includes("POSITION_LIMIT"))result.blockedReasons.push("POSITION_LIMIT");
      if(a.dailyPnl<=-a.dayStartEquity*adjusted.dailyLossLimitPct/100&&!result.blockedReasons.includes("DAILY_LOSS_LIMIT"))result.blockedReasons.push("DAILY_LOSS_LIMIT");
      if(publicData.markets.length&&!publicData.markets.some(row=>Math.max(5,row.filters.minNotional,row.filters.minQty*row.ask)<=Math.min(adjusted.orderNotional,adjustedBudget))
        &&!result.blockedReasons.includes("BELOW_CURRENT_EXCHANGE_MINIMUM"))result.blockedReasons.push("BELOW_CURRENT_EXCHANGE_MINIMUM");
      result.aiAdjustedFields=adjustableKeys.filter(key=>adjusted[key]!==result.settings[key]);
      result.settings=adjusted;result.source="ai";result.model=safeModel(answer.model);result.summary=parsed.summary;
      result.factorReasons=[...reasons,...parsed.reasons];result.provenance.provider=safeModel(answer.provider);result.blocked=result.blockedReasons.length>0;
      return finalize(result);
    } catch(error) {
      // Never echo upstream errors: providers may place keys, proxy URLs, or request bodies in them.
      const diagnostic:RecommendationDiagnostic=error instanceof RecommendationFailure?error.diagnostic:
        {stage,code:stage==="provider"?"provider_request_failed":`validation_${stage}`};
      if(error instanceof z.ZodError)diagnostic.validationFields=[...new Set(error.issues.flatMap(issue=>issue.path.filter(path=>typeof path==="string"&&adjustableKeys.includes(path as AdjustableKey))))] as string[];
      result.diagnostic=diagnostic;
      result.fallbackReason=diagnostic.code;
      result.fallbackMessage=diagnosticMessage(diagnostic);
      result.summary=`${result.fallbackMessage}已返回明确标注的规则建议草稿。`;
      // This object contains only fixed stage/code enums, allowlisted provider codes and
      // known settings field names. It never contains a response body, prompt or identity.
      console.warn("[alpha-automation-recommendation]",JSON.stringify(diagnostic));
      return finalize(result);
    }
  };
}

/** Read-only recommendation only: callers still need explicit save and a separate start authorization. */
export const recommendAutomationSettings=createAlphaAutomationRecommender();
