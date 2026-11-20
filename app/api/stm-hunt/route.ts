import { z } from "zod";
import { assertSameOrigin } from "@/lib/request-security";
import { alphaExecutionErrorResponse, requireAlphaReadOperator } from "@/lib/alpha-execution/access";
import { getStmDashboard, mutateStm } from "@/lib/stm-hunt/service";
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
export async function GET() {
  try {
    const viewer=await requireAlphaReadOperator().catch(()=>null);
    return Response.json(await getStmDashboard(viewer?.id),{headers:{"Cache-Control":"private, no-store"}});
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
