import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getRecord, listRecords, putRecord, stmJson } from "./store";
import { assessStmTokenRisk } from "./risk";
import { verifyStmBscSwap, type StmWalletProfile } from "./onchain";
import type { Address, Hash } from "viem";

const TRANSFER="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const SWAP="0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const PAY=new Set(["0x55d398326f99059ff775485246999027b3197955","0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d","0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c"]);
type Log={address:string;transactionHash:string;blockNumber:string;logIndex:string;topics:string[];removed?:boolean};
export interface StmScanCandidate {key:string;wallet:Address;token:Address;hash:Hash;block:bigint}
export interface StmScanStatus {asOf:string;status:"ok"|"partial"|"unavailable"|"idle";wallets:number;excludedWallets:number;verified:number;checked:number;rejected:number;lastBlock:string|null;head:string|null;backlog:string;message:string}
type Cursor={lastBlock:string;wallets:string[];startedAt:string;gap:boolean};
const topic=(address:string)=>`0x${address.toLowerCase().slice(2).padStart(64,"0")}`;
const hex=(number:bigint)=>`0x${number.toString(16)}`;
async function beforeDeadline<T>(job:Promise<T>,deadlineMs:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {return await Promise.race([job,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Scanner deadline exceeded")),Math.max(1,deadlineMs-Date.now()));})]);}
  finally {if(timer)clearTimeout(timer);}
}
async function rpc(method:string,params:unknown[]) {
  const url=process.env.BSC_RPC_URL||"https://bsc-dataseed.binance.org";
  const response=await fetch(url,{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(2500)});
  if(!response.ok)throw new Error("BSC RPC unavailable");
  const payload=await response.json();if(payload.error || payload.result===undefined)throw new Error("BSC RPC log query unsupported or rate limited");return payload.result;
}
export function stmScanCandidates(logs:Log[],wallets:string[]):StmScanCandidate[] {
  const wanted=new Set(wallets.map(wallet=>wallet.toLowerCase())),found=new Map<string,StmScanCandidate>();
  for(const log of logs) {
    if(log.removed || !/^0x[a-fA-F0-9]{40}$/.test(log.address) || !/^0x[a-fA-F0-9]{64}$/.test(log.transactionHash) || log.topics?.[0]?.toLowerCase()!==TRANSFER)continue;
    if(PAY.has(log.address.toLowerCase()))continue;
    for(const raw of log.topics.slice(1,3)) {
      if(!/^0x[0-9a-fA-F]{64}$/.test(raw))continue;
      const wallet=`0x${raw.slice(-40)}`.toLowerCase() as Address;if(!wanted.has(wallet))continue;
      const token=log.address.toLowerCase() as Address,hash=log.transactionHash.toLowerCase() as Hash;
      try {
        const key=`bsc:${hash}:${wallet}:${token}`;
        found.set(key,{key,wallet,token,hash,block:BigInt(log.blockNumber)});
      } catch { /* Malformed RPC logs cannot become evidence. */ }
    }
  }
  return [...found.values()].sort((a,b)=>a.block<b.block?-1:a.block>b.block?1:a.key.localeCompare(b.key));
}

/** Bounded watchlist scanner. It never claims to scan the whole chain. */
export async function scanStmBscWallets():Promise<StmScanStatus> {
  const asOf=new Date().toISOString(),deadlineMs=Date.now()+23000,owner=randomUUID();
  const status:StmScanStatus={asOf,status:"idle",wallets:0,excludedWallets:0,verified:0,checked:0,rejected:0,lastBlock:null,head:null,backlog:"0",message:"等待管理员审核 BSC 钱包及资金关联组；尚未扫描全链"};
  const created=await prisma.stmHuntRecord.createMany({data:[{userId:"system",kind:"scanner-lease",key:"bsc",payload:{owner}}],skipDuplicates:true});
  const claimed=created.count || (await prisma.stmHuntRecord.updateMany({where:{userId:"system",kind:"scanner-lease",key:"bsc",updatedAt:{lt:new Date(Date.now()-90000)}},data:{payload:{owner}}})).count;
  if(!claimed)return {...status,status:"partial",message:"另一采集实例正在运行，本次未重复扫描"};
  try {
    const profiles=(await listRecords<StmWalletProfile>("system","vetted-wallet",1000)).map(row=>row.payload).filter(row=>row.chain==="bsc"&&row.qualified&&row.reviewedAt&&row.clusterId&&/^0x[a-fA-F0-9]{40}$/.test(row.address)).sort((a,b)=>a.address.localeCompare(b.address));
    const selected=profiles.slice(0,10),wallets=selected.map(row=>row.address.toLowerCase());
    status.wallets=wallets.length;status.excludedWallets=Math.max(0,profiles.length-10);
    if(!wallets.length){await putRecord("system","scanner-status","bsc",status);return status;}
    const head=BigInt(await rpc("eth_blockNumber",[])),confirmed=head>3n?head-3n:0n;
    status.head=head.toString();
    const cursor=await getRecord<Cursor>("system","scanner-cursor","bsc");
    const sameRoster=cursor && JSON.stringify(cursor.wallets)===JSON.stringify(wallets);
    const initial=confirmed>999n?confirmed-999n:0n;
    const from=sameRoster?BigInt(cursor.lastBlock)+1n:initial;
    const to=from+999n<confirmed?from+999n:confirmed;
    if(from>confirmed){status.status="ok";status.lastBlock=cursor?.lastBlock??null;status.message="已追平确认区块；仅监控审核钱包";await putRecord("system","scanner-status","bsc",status);return status;}
    const padded=wallets.map(topic);
    const [incoming,outgoing]=await Promise.all([
      rpc("eth_getLogs",[{fromBlock:hex(from),toBlock:hex(to),topics:[TRANSFER,null,padded]}]),
      rpc("eth_getLogs",[{fromBlock:hex(from),toBlock:hex(to),topics:[TRANSFER,padded]}]),
    ]);
    if(!Array.isArray(incoming)||!Array.isArray(outgoing)||incoming.length+outgoing.length>10000)throw new Error("RPC log response exceeds bounded scan budget");
    const candidates=stmScanCandidates([...incoming,...outgoing],wallets);
    const knownRows=candidates.length?await prisma.stmHuntRecord.findMany({where:{userId:"system",kind:{in:["chain-event","scan-rejected"]},key:{in:candidates.map(row=>row.key)}},select:{key:true}}):[];
    const known=new Set(knownRows.map(row=>row.key)),pending=candidates.filter(row=>!known.has(row.key));
    const checked=new Set<string>();
    const batch=pending.slice(0,8);
    // Up to four concurrent checks, each bounded by the verifier deadline.
    for(let offset=0;offset<batch.length;offset+=4) {
      if(Date.now()>deadlineMs-6000)break;
      await Promise.all(batch.slice(offset,offset+4).map(async candidate=>{
        if(Date.now()>deadlineMs-5000)return;
        try {
          const receipt=await rpc("eth_getTransactionReceipt",[candidate.hash]);
          if(receipt?.status!=="0x1" || receipt?.from?.toLowerCase()!==candidate.wallet || !Array.isArray(receipt.logs) || !receipt.logs.some((log:Log)=>log.topics?.[0]?.toLowerCase()===SWAP)) {
            await putRecord("system","scan-rejected",candidate.key,{asOf,reason:"非钱包发起的成功 V2 Swap；普通转账不计入信号"});checked.add(candidate.key);status.rejected++;return;
          }
          const profile=selected.find(row=>row.address.toLowerCase()===candidate.wallet)!;
          const risk=await beforeDeadline(assessStmTokenRisk({chain:"bsc",address:candidate.token}),deadlineMs-3000);
          if(Date.now()>deadlineMs-3000)return;
          const event=await beforeDeadline(verifyStmBscSwap({chain:"bsc",hash:candidate.hash,wallet:candidate.wallet,token:candidate.token},profile,{passed:risk.riskPassed,liquidityUsd:risk.liquidityUsd,routeAvailable:risk.routeAvailable},{timeoutMs:1500,retryCount:0,maxLogs:40,deadlineMs}),deadlineMs);
          await prisma.stmHuntRecord.createMany({data:[{userId:"system",kind:"chain-event",key:event.id,payload:stmJson(event)}],skipDuplicates:true});
          checked.add(candidate.key);status.verified++;
        } catch(error) {
          if(error instanceof Error && /未找到已注册|钱包没有该代币|只接收最近|成交数量无效/.test(error.message)) {
            await putRecord("system","scan-rejected",candidate.key,{asOf,reason:"收据未通过真实池 Swap 核验，已排除"});checked.add(candidate.key);status.rejected++;
          }
          // Transient RPC failures remain pending; never advance over them.
        } finally {status.checked++;}
      }));
    }
    const unfinished=pending.filter(row=>!checked.has(row.key));
    const last=unfinished.length?(unfinished[0].block>from?unfinished[0].block-1n:from-1n):to;
    status.lastBlock=last.toString();status.backlog=(confirmed-last).toString();
    const gap=!sameRoster || cursor?.gap===true;
    await putRecord("system","scanner-cursor","bsc",{lastBlock:last.toString(),wallets,startedAt:sameRoster?cursor.startedAt:asOf,gap});
    status.status=unfinished.length || last<confirmed || status.excludedWallets ? "partial":"ok";
    status.message=`BSC 审核钱包 ${wallets.length}/10；扫描 ${from}–${to}，核验 ${status.verified} 笔，剩余区块 ${status.backlog}。${gap?"从启用时最近1000块开始，不补造更早历史。":""}${status.excludedWallets?`${status.excludedWallets} 个超出监控上限的钱包需专用数据提供商。`:""}${unfinished.length?"未完成的收据保持游标待重试，候选尚未视为成交。":""}`;
    await putRecord("system","scanner-status","bsc",status);return status;
  } catch {
    status.status="unavailable";status.message="公开 BSC RPC 不支持该日志查询、超时或限流；游标未前进。可配置具备 eth_getLogs 能力的 BSC_RPC_URL，签名采集接口仍可独立接入。";
    await putRecord("system","scanner-status","bsc",status);return status;
  } finally {
    await prisma.stmHuntRecord.updateMany({where:{userId:"system",kind:"scanner-lease",key:"bsc",payload:{equals:{owner}}},data:{updatedAt:new Date(0)}}).catch(()=>undefined);
  }
}
