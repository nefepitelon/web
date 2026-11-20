import { timingSafeEqual } from "node:crypto";
import { refreshStmCapture, sweepStmAlerts } from "@/lib/stm-hunt/service";
import { scanStmBscWallets } from "@/lib/stm-hunt/scanner";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:Request) {
  const secret=process.env.CRON_SECRET,actual=request.headers.get("authorization")??"",expected=`Bearer ${secret}`;
  if(!secret || actual.length!==expected.length || !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return Response.json({error:"Unauthorized"},{status:401});
  try {
    const [,scanner]=await Promise.all([refreshStmCapture(),scanStmBscWallets()]);
    return Response.json({ok:true,...await sweepStmAlerts(),scanner},{headers:{"Cache-Control":"no-store"}});
  }
  catch {return Response.json({ok:false,error:"STM capture failed; no trade was submitted"},{status:503});}
}
