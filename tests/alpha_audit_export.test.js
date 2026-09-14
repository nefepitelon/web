const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module = {exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require(name){
    if(name==='server-only') return {};
    if(name in imports) return imports[name];
    if(name==='@prisma/client'||name==='zod')return require(name);
    throw new Error(`Unmocked import ${name}`);
  },Buffer,Date,TextEncoder,ReadableStream,Response,URL});
  return module.exports;
}

function matches(row, where) {
  return Object.entries(where).every(([key,value])=>{
    if(key==='AND')return value.every(item=>matches(row,item));
    if(key==='OR')return value.some(item=>matches(row,item));
    if(['intent','plan','order'].includes(key))return row[key] != null && matches(row[key],value.is);
    if(key==='metadata')return value.path.reduce((obj,field)=>obj?.[field],row.metadata) === value.equals;
    const actual=row[key];
    if(value instanceof Date)return Number(actual)===Number(value);
    if(value && typeof value==='object')return Object.entries(value).every(([op,wanted])=>op==='lt'?actual<wanted:op==='lte'?actual<=wanted:false);
    return actual===value;
  });
}

function auditFixture(rows) {
  const reads=[];
  const prisma={alphaTradingAudit:{
    findMany:async ({where,take})=>{reads.push(where);return rows.filter(row=>matches(row,where)).sort((a,b)=>Number(b.createdAt)-Number(a.createdAt)||b.id.localeCompare(a.id)).slice(0,take);},
    count:async ({where})=>rows.filter(row=>matches(row,where)).length,
  }};
  const mod=load('lib/alpha-execution/audit-export.ts',{'@/lib/prisma':{prisma}});
  return {...mod,reads,prisma};
}

function audit(id,userId='alice',environment='LIVE',market='FUTURES') {
  return {id,userId,createdAt:new Date('2026-01-01T12:00:00Z'),state:'CLOSED',status:'FILLED',message:'real server audit',metadata:null,intentId:'intent-'+id,planId:null,orderId:null,intent:{environment,market,symbol:'BTCUSDT'},plan:null,order:null};
}

test('audit CSV exports every scoped server record beyond the 60-row dashboard and 1000-row page', async()=>{
  const rows=Array.from({length:1255},(_,i)=>audit(`row-${String(i).padStart(4,'0')}`));
  rows.push(audit('other-user','bob'),audit('paper','alice','PAPER'),audit('spot','alice','LIVE','SPOT'));
  const mod=auditFixture(rows);
  const response=await mod.auditCsvResponse('alice',mod.auditQuerySchema.parse({mode:'live',market:'futures',format:'csv'}));
  const csv=await response.text();
  assert.equal(response.headers.get('x-export-row-count'),'1255');
  assert.equal(csv.split('\r\n').filter(Boolean).length,1256);
  assert.match(csv,/row-0000/);
  assert.match(csv,/row-1254/);
  assert.doesNotMatch(csv,/other-user|"paper"|"spot"/);
  assert.ok(mod.reads.length>=2);
  assert.ok(mod.reads.every(where=>where.userId==='alice'));
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('audit keyset cursor preserves same-timestamp rows and cutoff, and cannot change the authenticated owner', async()=>{
  const rows=[audit('a'),audit('b'),audit('c'),audit('z','bob'),{...audit('future'),createdAt:new Date('2026-01-02T00:00:00Z')}];
  const mod=auditFixture(rows);
  const query=mod.auditQuerySchema.parse({limit:2,asOf:'2026-01-01T13:00:00Z',market:'futures'});
  const first=await mod.readAuditPage('alice',query);
  assert.deepEqual(Array.from(first.items,x=>x.id),['c','b']);
  const next=await mod.readAuditPage('alice',{...query,cursor:first.nextCursor});
  assert.deepEqual(Array.from(next.items,x=>x.id),['a']);
  assert.equal(next.hasMore,false);
  const forged=Buffer.from(JSON.stringify({id:'zz',createdAt:'2026-01-01T12:00:00Z',asOf:'2026-01-01T13:00:00Z',userId:'bob'})).toString('base64url');
  const attempt=await mod.readAuditPage('alice',{...query,cursor:forged,limit:100});
  assert.ok(attempt.items.every(row=>row.id!=='z'));
});

test('environment metadata is a fallback only for unlinked events, unscoped events are explicitly excluded',async()=>{
  const linkedPaper={...audit('linked-paper','alice','PAPER'),metadata:{environment:'LIVE',market:'FUTURES'}};
  const standalone={...audit('standalone'),intentId:null,intent:null,metadata:{environment:'live',market:'futures'}};
  const unknown={...audit('unknown'),intentId:null,intent:null};
  const mod=auditFixture([linkedPaper,standalone,unknown]);
  const result=await mod.readAuditPage('alice',mod.auditQuerySchema.parse({market:'futures'}));
  assert.deepEqual(Array.from(result.items,x=>x.id),['standalone']);
  assert.match(result.scopeNote,/无法归属环境/);
});

test('CSV escapes quoted multiline cells and neutralizes spreadsheet formula prefixes',()=>{
  const mod=auditFixture([]);
  const value=mod.publicAuditRow({...audit('formula'),message:'=HYPERLINK("unsafe")\nnext',metadata:{detail:'quoted "text"'}});
  const line=mod.auditCsvLine(value);
  assert.match(line,/"'=HYPERLINK\(""unsafe""\)\nnext"/);
  assert.match(line,/"metadata"|"detail""/);
});

test('oversize CSV exports and failed queries fail explicitly rather than silently truncating',async()=>{
  const mod=auditFixture([]);
  mod.prisma.alphaTradingAudit.count=async()=>100001;
  await assert.rejects(mod.auditCsvResponse('alice',mod.auditQuerySchema.parse({format:'csv'})),/100,000/);
  mod.prisma.alphaTradingAudit.count=async()=>1;
  mod.prisma.alphaTradingAudit.findMany=async()=>{throw new Error('database unavailable');};
  const response=await mod.auditCsvResponse('alice',mod.auditQuerySchema.parse({format:'csv'}));
  await assert.rejects(response.text(),/database unavailable/);
});

test('audit route uses only viewer identity and catches asynchronous export errors; unauthenticated requests cannot query',async()=>{
  let identity;let called=0;let authenticated=true;
  const mod=load('app/api/alpha-execution/audits/route.ts',{
    '@/lib/alpha-execution/access':{requireAlphaOperator:async()=>{if(!authenticated)throw new Error('unauthorized');return{id:'alice'};},alphaExecutionErrorResponse:error=>Response.json({error:error.message},{status:403})},
    '@/lib/alpha-execution/audit-export':{auditQuerySchema:require('zod').z.object({format:require('zod').z.string()}),auditCsvResponse:async(user)=>{called++;identity=user;throw new Error('count failed');},readAuditPage:async()=>{called++;return{};}},
  });
  const response=await mod.GET({url:'https://example.test/api/alpha-execution/audits?format=csv&userId=bob'});
  assert.equal(identity,'alice');assert.equal(response.status,403);assert.equal((await response.json()).error,'count failed');
  authenticated=false;
  const unauthorized=await mod.GET({url:'https://example.test/api/alpha-execution/audits?format=csv'});
  assert.equal(unauthorized.status,403);assert.equal(called,1);
});
