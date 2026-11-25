import { z } from "zod";
import { createHash } from "node:crypto";
import { assertSameOrigin } from "@/lib/request-security";
import { alphaExecutionErrorResponse, requireAlphaReadOperator } from "@/lib/alpha-execution/access";
import { getStmDashboard, mutateStm } from "@/lib/stm-hunt/service";
import type { StmDashboard } from "@/lib/stm-hunt/types";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;
const strategyId=z.enum(["S1","S2","S3","S4","S5"]);
const id=z.string().min(1).max(256);
const bps=z.number().finite().min(0).max(500);
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("refresh")}).strict(),
  z.object({action:z.literal("watch"),id,enabled:z.boolean()}).strict(),
  z.object({action:z.literal("strategy"),strategy:z.object({id:strategyId,enabled:z.boolean().optional(),minEntities:z.number().int().min(3).max(100).optional(),windowMinutes:z.number().int().min(5).max(1440).optional(),minVolumeRatio:z.number().min(1).max(20).optional(),minLiquidityUsd:z.number().min(10000).max(100000000).optional()}).strict()}).strict(),
  z.object({action:z.literal("paper-open"),candidateId:id,strategy:strategyId,notionalUsd:z.number().finite().min(10).max(10000),feeBps:bps.optional(),slippageBps:bps.optional(),idempotencyKey:z.string().uuid()}).strict(),
  z.object({action:z.literal("paper-close"),id}).strict(),
  z.object({action:z.literal("replay"),feeBps:bps.optional(),slippageBps:bps.optional()}).strict(),
  z.object({action:z.literal("alert-read"),id}).strict(),
]);
function dashboardTag(dashboard:StmDashboard,viewerId:string|null) {
  // A weak validator describes equivalent research evidence, not identical clock text.
  // Every request still re-evaluates expiry and private state before comparison.
  const stable={...dashboard,sources:dashboard.sources.map(source=>({...source,sourceAgeSeconds:undefined,
    ...(["verified-chain","bsc-scanner"].includes(source.id)?{fetchedAt:undefined}: {})})),
    signals:dashboard.signals.map(signal=>({...signal,asOf:undefined,expiresAt:undefined}))};
  return `W/"${createHash("sha256").update(JSON.stringify({viewerId,dashboard:stable})).digest("hex")}"`;
}
export async function GET(request:Request) {
  try {
    const viewer=await requireAlphaReadOperator().catch(()=>null);
    const dashboard=await getStmDashboard(viewer?.id),etag=dashboardTag(dashboard,viewer?.id??null);
    const headers={"Cache-Control":"private, no-cache, must-revalidate",ETag:etag,Vary:"Cookie, Authorization","X-STM-Evaluated-At":new Date().toISOString()};
    const supplied=request.headers.get("if-none-match")??"";
    if(supplied.split(",").map(value=>value.trim().replace(/^W\//,"")).includes(etag.replace(/^W\//,"")))return new Response(null,{status:304,headers});
    return Response.json(dashboard,{headers});
  } catch(error) {return alphaExecutionErrorResponse(error);}
}
export async function POST(request:Request) {
  try {
    assertSameOrigin(request);
    const viewer=await requireAlphaReadOperator();
    if(Number(request.headers.get("content-length")??0)>16000) return Response.json({error:"请求过大"},{status:413});
    const body=await request.text();if(body.length>16000)return Response.json({error:"请求过大"},{status:413});
    const result=await mutateStm(viewer.id,schema.parse(JSON.parse(body)));
    return Response.json({ok:true,...(result as object)},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return alphaExecutionErrorResponse(error);}
}
