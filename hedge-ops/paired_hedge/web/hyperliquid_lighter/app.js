'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const known=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
const fmt=(n,d=2)=>known(n)?Number(n).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const money=n=>known(n)?'$'+fmt(n):'—', signed=n=>known(n)?(n>0?'+':'')+money(n):'—';
const tone=n=>known(n)?n<0?'neg':n>0?'pos':'':'dim';
const stamp=n=>n?new Date(Number(n)*1000).toLocaleString('zh-CN'):'—';
const names={binance:'Hyperliquid',lighter:'Lighter'};
let state={},busy=false,reading=false,editing=null,sortKey='net_bps_h',descending=true,filter='',lastReadError='';
let spreadsLoading=false,spreadsReadAt=0;
let resumeRead=false;
function consoleActive(){return typeof window.hedgeConsoleIsActive!=='function'||window.hedgeConsoleIsActive();}
function inactiveRead(error){return !!error?.hedgeConsoleInactive||(error?.name==='AbortError'&&!consoleActive());}
async function api(path,options={}){
  const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  let b;try{b=await r.json();}catch{throw Error('无效服务响应（HTTP '+r.status+'）');}
  if(!r.ok)throw Error(typeof b.detail==='string'?b.detail:b.error||'请求失败（HTTP '+r.status+'）');return b;
}
function showError(message){$('error').hidden=!message;$('error').textContent=message||'';}
function cells(values){return values.map(v=>'<td>'+esc(v)+'</td>').join('');}
function table(id,rows,cols,text){$(id).innerHTML=rows.join('')||'<tr><td colspan="'+cols+'" class="dim" style="text-align:center;padding:26px">'+esc(text)+'</td></tr>';}
async function action(fn){
  if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{showError('');await fn();await refresh();}catch(e){showError(e.message);$('task-safety-note').textContent=e.message;}
  finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);renderTasks();}
}
async function refresh(force=false){
  if(reading||!consoleActive())return;resumeRead=false;reading=true;
  try{const keys=['status','funding','tasks','stats','cycles'];const results=await Promise.allSettled(keys.map(k=>api(k==='funding'&&force?'funding?refresh=true':k)));const errors=[];
    results.forEach((r,i)=>{if(r.status==='fulfilled')state[keys[i]]=r.value;else if(!inactiveRead(r.reason))errors.push(keys[i]+': '+r.reason.message);});
    if(!consoleActive())return;
    try{state.capacity=await api('capacity');}catch(e){if(!inactiveRead(e))errors.push('capacity: '+e.message);}
    if(!consoleActive())return;
    lastReadError=errors.join('；');render();loadSpreads(force);
  }finally{reading=false;if(resumeRead&&consoleActive()&&!busy){resumeRead=false;void refresh();}}
}
async function loadSpreads(force=false){
  if(!consoleActive()||spreadsLoading||(!force&&Date.now()-spreadsReadAt<600000))return;
  spreadsLoading=true;$('spread-meta').textContent='正在扫描两所盘口…';
  try{state.spreads=await api(force?'spreads?refresh=true':'spreads');spreadsReadAt=Date.now();renderAssets();}
  catch(e){if(!inactiveRead(e))$('spread-meta').textContent='价差读取失败；未知币种排在末尾';}
  finally{spreadsLoading=false;}
}
function renderAssets(){
  const selected=$('f-asset').value,spreads=new Map((state.spreads?.assets||[]).map(r=>[r.asset,r]));
  const assets=[...new Set([...(state.funding?.rows||[]).map(r=>r.asset),...(state.tasks?.tasks||[]).map(t=>t.asset),...(editing?[editing]:[])])];
  assets.sort((a,b)=>{const x=spreads.get(a)?.total_bps,y=spreads.get(b)?.total_bps;return known(x)&&known(y)?Number(x)-Number(y)||a.localeCompare(b):known(x)?-1:known(y)?1:a.localeCompare(b);});
  const options=assets.map(a=>{const r=spreads.get(a);return '<option value="'+esc(a)+'">'+esc(a)+(known(r?.total_bps)?' · '+fmt(r.total_bps,2)+' bps（Hyperliquid '+fmt(r.binance_bps,2)+' / Lighter '+fmt(r.lighter_bps,2)+'）':' · 价差待扫描')+'</option>';}).join('');
  if($('f-asset').innerHTML!==options&&document.activeElement!==$('f-asset')){$('f-asset').innerHTML=options;if(assets.includes(selected))$('f-asset').value=selected;}
  $('spread-meta').textContent=state.spreads?.scanned_at?'盘口扫描 '+stamp(state.spreads.scanned_at)+' · 未知项置后':'价差待扫描';
  taskOptions();
}
function taskOptions(){
  const r=(state.funding?.rows||[]).find(r=>r.asset===$('f-asset').value),cap=r?.max_leverage;
  $('f-leverage').max=known(cap)?cap:150;
  $('leverage-hint').textContent=r?'上限 Hyperliquid '+(known(r.binance_max_leverage)?r.binance_max_leverage+'×':'待核实')+' / Lighter '+(known(r.lighter_max_leverage)?r.lighter_max_leverage+'×':'待核实'):'开仓前核实两所上限';
  $('maker-wait-field').hidden=$('f-order-type').value!=='binance_maker';
}
function card(title,sub,a,s,total=false){
  const values=total?[
    ['可用',money(a.available)],['浮动盈亏',signed(a.unrealized),'',tone(a.unrealized)],['交易量',money(s.volume),'已确认成交 · 近似 USD'],
    ['手续费',money(s.fees),'未知费用显示为 —'],['闭仓损益',signed(s.closed_trade_pnl_approx_usd),'不含资金费 · '+(s.rounds||0)+' 轮',tone(s.closed_trade_pnl_approx_usd)],['每万美元磨损',money(a.wear),'仅完整闭仓轮次']
  ]:[['可用',money(a.available)],['浮动盈亏',signed(a.unrealized),'',tone(a.unrealized)],['持仓',known(a.positions)?a.positions+' 个':'—',a.mode],['交易量',money(s.volume),'本平台已确认'],['手续费',money(s.fees),'本平台成交费用'],['成交',(s.fills||0)+' 笔']];
  return `<div class="ledger-card${total?' total':''}"><header><span class="venue-logo ${title==='Hyperliquid'?'entropy-logo':'arcus-logo'}">${total?'∑':esc(title[0])}</span><div><b>${esc(title)}</b><small>${esc(sub)}</small></div><i>${a.connected?'账户权益':'读取未完成'}</i></header><div class="ledger-equity">${money(a.equity)}<small>${esc(a.unit)}</small></div><div class="ledger-cells">${values.map(([k,v,n,c])=>`<div><span>${esc(k)}</span><b class="${c||''}">${esc(v)}</b>${n?'<small>'+esc(n)+'</small>':''}</div>`).join('')}</div>${a.error?'<p class="account-error">'+esc(a.error)+'</p>':''}</div>`;
}
function renderAccounts(){
  const f=state.funding||{},s=state.stats||{},v=f.venues||{};
  const sum=k=>['binance','lighter'].every(n=>known(v[n]?.[k]))?Number(v.binance[k])+Number(v.lighter[k]):null;
  const volume=(s.tasks||[]).filter(t=>t.rounds).reduce((n,t)=>n+Number(t.closed_volume||0),0);
  const total={connected:['binance','lighter'].every(n=>v[n]?.connected),unit:'近似 USD',equity:sum('equity'),available:sum('available'),unrealized:sum('unrealized'),wear:known(s.closed_trade_pnl_approx_usd)&&volume?-Number(s.closed_trade_pnl_approx_usd)/volume*10000:null};
  $('ledger-grid').innerHTML=['binance','lighter'].map(n=>card(names[n],n==='binance'?'原生 · USDC 永续':'Core · USDC 永续',v[n]||{},s.by_venue?.[n]||{})).join('')+card('合计','两所加总 · 本平台成交统计',total,s,true);
  $('ledger-meta').textContent='账户读取 '+stamp(f.updated_at);$('ledger-note').textContent=s.note||'未连接的账户余额不会视为零。';
  table('ledger-body',(s.tasks||[]).map(t=>'<tr>'+cells([t.asset,t.opens,money(t.volume.binance),money(t.volume.lighter),money(t.total_volume),money(t.fees),signed(t.spread_pnl),signed(t.closed_pnl),money(t.wear_per_10k)])+'</tr>'),9,'暂无本平台成交与任务记录');
  $('venue-grid').innerHTML=['binance','lighter'].map(n=>{const a=v[n]||{};return `<div class="venue-card ${a.connected?'':'bad'}"><header><span class="pulse-dot"></span><div><b>${names[n]}</b></div><i>${a.connected?'读取正常':'账户未就绪'}</i></header><div class="row"><span>${esc(a.mode||'等待账户读取')}</span></div><div class="row"><span>网络出口</span><b>${esc(a.route||'—')}</b></div>${a.error?'<p class="venue-error">'+esc(a.error)+'</p>':''}</div>`;}).join('');
}
function renderFunding(){
  const f=state.funding||{},all=f.rows||[],cost=Number($('cost-input').value)||0;
  const best=all.reduce((a,b)=>Number(a?.net_bps_h||0)>Number(b.net_bps_h)?a:b,null),threshold=Number(state.status?.settings?.MIN_NET_FUNDING_BPS_H||0);
  const cards=[['共有币种',all.length,'MATCHED','相同单位的两所永续市场'],['费差达标',all.filter(r=>r.net_bps_h>=threshold).length,'FUNDING','开仓还须通过全部实盘检查'],['最优净费率',fmt(best?.net_bps_h,3),'BPS/H',best?.asset||'等待行情'],['最优年化',best?fmt(best.net_bps_h*24*365/100,1)+'%':'—','APR','当前费率线性估计，不含成本']];
  $('stats-grid').innerHTML=cards.map(([k,v,u,n])=>`<div class="stat-card"><div class="stat-top"><span>${k}</span><i>${u}</i></div><div class="stat-value">${v}</div><div class="stat-foot"><span class="trend neutral">●</span><span>${esc(n)}</span></div></div>`).join('');
  const rows=all.filter(r=>r.asset.includes(filter.toUpperCase())).sort((a,b)=>(typeof a[sortKey]==='string'?a[sortKey].localeCompare(b[sortKey]):Number(a[sortKey])-Number(b[sortKey]))*(descending?-1:1));
  table('funding-body',rows.map(r=>{
    const long=r.direction==='BINANCE_LONG',apr=r.net_bps_h*24*365/100,payback=r.net_bps_h>0?cost/r.net_bps_h:null;
    return `<tr><td><div class="asset-cell"><b>${esc(r.asset)}</b><small>${esc(r.asset)} · Hyperliquid ${esc(r.binance_interval_h)}h / Lighter ${esc(r.lighter_interval_h)}h</small></div></td>
      <td class="${tone(r.binance_bps_h)}">${fmt(r.binance_bps_h,3)}</td><td class="${tone(r.lighter_bps_h)}">${fmt(r.lighter_bps_h,3)}</td>
      <td class="${tone(r.net_bps_h)}"><b>${fmt(r.net_bps_h,3)}</b></td><td><span class="dir-pill ${long?'long-entropy':'short-entropy'}">${long?'Hyperliquid 多 / Lighter 空':'Lighter 多 / Hyperliquid 空'}</span></td>
      <td class="${tone(apr)}">${fmt(apr,1)}%</td><td class="${tone(r.net_bps_h)}">${fmt(r.net_bps_h*24,2)}</td><td class="${payback!==null&&payback<24?'pos':'dim'}">${fmt(payback,1)}</td><td class="leverage-cell" title="${esc(r.leverage_error||'两所官方上限的较小值；实际还受名义额档位与账户限制')}"><b>${known(r.max_leverage)?esc(r.max_leverage)+'×':'待核实'}</b><small>Hyperliquid ${known(r.binance_max_leverage)?esc(r.binance_max_leverage)+'×':'待核实'} / Lighter ${known(r.lighter_max_leverage)?esc(r.lighter_max_leverage)+'×':'待核实'}</small></td></tr>`;
  }),9,f.funding_ready?'没有匹配的币种':'暂无可用行情');
  $('table-meta').textContent=(f.funding_ready?'更新于 ':'行情未刷新；上次 ')+stamp(f.generated_at);$('nav-count').textContent=all.length;
  renderAssets();
}
function renderPositions(){
  const f=state.funding||{},positions=f.positions||[],groups=new Map(),complete=['binance','lighter'].every(v=>f.venues?.[v]?.connected);
  positions.forEach(p=>{if(!groups.has(p.asset))groups.set(p.asset,[]);groups.get(p.asset).push(p);});$('pos-meta').textContent=positions.length+' 条可读持仓';
  $('acct-note').textContent=complete?'仅任务账本一致的仓位可由本平台管理；任务外仓位不会自动接管。':'账户读取尚未全部成功；以下为已读取的持仓，不能据此判定另一所空仓。';
  $('pos-grid').innerHTML=[...groups].map(([asset,legs])=>{
    const hedged=complete&&legs.length===2&&Math.abs(legs.reduce((n,p)=>n+Number(p.quantity),0))<1e-10,owned=legs.every(p=>p.owned),danger=legs.some(p=>p.risk||!p.sane);
    return `<div class="pos-card ${danger?'danger':hedged&&owned?'ok':'unhedged'}"><header><b>${esc(asset)}</b><i>${danger?'强平风险 / 数据异常':!complete?'另一侧未知':hedged?'数量对冲':'数量未对齐'} · ${owned?'账本一致':'未归属本平台'}</i></header>${legs.map(p=>`<div class="leg ${p.risk?'risk':'safe'}"><span class="leg-venue">${names[p.venue]}</span><span class="leg-main">${p.quantity>0?'多':'空'} ${fmt(Math.abs(p.quantity),6)}<small>开仓 ${fmt(p.entry,4)} · 标记 ${fmt(p.mark,4)} · 强平 ${fmt(p.liquidation,4)}${known(p.leverage)?' · '+fmt(p.leverage,1)+'×':''}<br>浮盈亏 ${signed(p.unrealized)}</small></span><span class="leg-dist">${known(p.distance_pct)?fmt(p.distance_pct)+'%':'—'}<small>距强平</small></span></div>`).join('')}</div>`;
  }).join('')||'<p class="dim">'+(complete?'双所当前没有持仓。':'尚无可读取的持仓。')+'</p>';
}
const phases={IDLE:'待机',OPENING:'开仓中',OPEN:'持仓中',CLOSING:'平仓中',REVIEW:'需人工核对'};
const editable=t=>t.phase==='IDLE'&&!Object.values(t.managed||{}).some(Number);
function renderTasks(){
  const tasks=state.tasks?.tasks||[],dry=state.status?.dry_run!==false;$('nav-tasks').textContent=tasks.length;
  $('dry-banner').textContent=dry?'演练模式：记录判断，不发送真实订单。':'实盘模式：启用任务后会按引擎周期真实开平仓。';
  $('task-list').innerHTML=tasks.map(t=>`<div class="console-task"><div class="task-top"><b>${esc(t.asset)}</b><span class="state-badge ${t.phase==='REVIEW'?'review':t.enabled?'running':''}">${t.enabled?'启用':'停用'} · ${esc(phases[t.phase]||t.phase)}</span><div class="task-actions"><button class="mini-btn" data-task="${esc(t.asset)}" data-action="edit" ${editable(t)?'':'disabled'}>编辑</button><button class="mini-btn" data-task="${esc(t.asset)}" data-action="toggle">${t.enabled?'停用并平仓':'启用'}</button><button class="mini-btn" data-task="${esc(t.asset)}" data-action="delete" ${editable(t)&&!t.enabled?'':'disabled'}>删除</button></div></div><div class="task-details"><div>单腿金额 USD<b>${esc(t.notional)} – ${esc(t.notional_max||t.notional)}</b></div><div>轮换时间 小时<b>${esc(t.hold_hours)} – ${esc(t.hold_hours_max||t.hold_hours)}</b></div><div>自有数量 Hyperliquid / Lighter<b>${esc(t.managed?.binance)} / ${esc(t.managed?.lighter)}</b></div><div>本轮金额 / 时长<b>${esc(t.sampled_notional||'—')} / ${esc(t.sampled_hold_hours||'—')}</b></div></div>${t.error?'<p class="venue-error">'+esc(t.error)+'</p>':''}</div>`).join('')||'<p class="dim">暂无任务。选择共同币种、金额与轮换时间后保存。</p>';
  $('task-list').querySelectorAll('[data-action]').forEach(b=>{b.disabled=b.disabled||busy;b.onclick=()=>{
    const t=tasks.find(t=>t.asset===b.dataset.task);
    if(b.dataset.action==='edit'){editing=t.asset;$('f-asset').value=t.asset;$('f-asset').disabled=true;$('f-notional').value=t.notional;$('f-notional-max').value=t.notional_max||'';$('f-rotation').value=t.hold_hours;$('f-rotation-max').value=t.hold_hours_max||'';$('f-leverage').value=t.leverage??'';$('f-order-type').value=t.order_type||'ioc';$('f-maker-wait').value=t.maker_wait_seconds||20;taskOptions();$('cancel-edit').hidden=false;$('f-save').textContent='保存任务';$('task-form').scrollIntoView({behavior:'smooth'});return;}
    if(b.dataset.action==='toggle'&&!t.enabled&&!dry&&!confirm('确认启用 '+t.asset+' 实盘任务？引擎将使用已保存凭据真实开平仓。'))return;
    action(()=>api('tasks'+(b.dataset.action==='delete'?'/'+encodeURIComponent(t.asset):''),{method:b.dataset.action==='delete'?'DELETE':'POST',body:b.dataset.action==='delete'?undefined:JSON.stringify({asset:t.asset,enabled:!t.enabled})}));
  };});
  $('task-list').querySelectorAll('.console-task').forEach((card,index)=>{const t=tasks[index],note=document.createElement('p');note.className='task-config';note.textContent='杠杆：'+(t.leverage?t.leverage+'×（双所）':'沿用交易所')+' · '+(t.order_type==='binance_maker'?'Hyperliquid 限价挂单 / Lighter IOC · 最多 '+(t.maker_wait_seconds||20)+' 秒':'双腿 IOC · 滑点保护');card.querySelector('.task-top').after(note);});
  $('cycle-log').innerHTML=(state.cycles?.cycles||[]).map(e=>'<p class="system-values">'+esc(stamp(e.at)+' · '+e.asset+' · '+e.reason)+'</p>').join('')||'<p class="dim">暂无执行记录。</p>';
}
function renderSystem(){
  $('system-dump').textContent=JSON.stringify(state.status||{},null,2);$('stats-note').textContent=(state.stats?.note||'')+' 下表显示最近 100 条订单，含待确认、拒单与真实成交。';
  table('orders',(state.stats?.orders||[]).map(o=>'<tr>'+cells([stamp(o.at),names[o.venue]+' / '+o.asset,o.side+(o.reduce_only?' · 减仓':''),o.client_id,o.state,fmt(o.filled,6),money(o.quote),money(o.fee)])+'</tr>'),8,'暂无订单记录');
  $('diagnostics').innerHTML=Object.entries(state.funding?.errors||{}).map(([v,e])=>'<p class="diagnostic-error">'+esc(names[v]||v)+': '+esc(e)+'</p>').join('')+'<h3>账户与交易控制</h3><p>每个控制台使用独立交易账户和专用 API 凭据。Binance 要求单向、单资产 USD-M；OKX 要求单币种保证金、净持仓及全仓；Hyperliquid 使用原生 USDC 永续、已授权 agent 和资金账户地址；Lighter 使用 Core 实例。实盘预检不发送订单，首次成交仍须核对交易所。</p><h3>执行与恢复</h3><p>先记录订单意图，再发送订单；只按终态实际成交数量对冲。未知结果暂停并按原客户端订单号恢复，不重复报单。仅撤销本任务订单、仅减仓处理本任务仓位。杠杆仅在双腿空仓时设置并读回确认。手续费未知时显示未知，统计不包含资金费及外部交易。</p>';
}
function renderGauge(){
  const c=state.capacity||{},max=c.maximum_daily_volume,current=c.estimated_daily_volume,ratio=known(max)&&max>0?Math.min(1,Math.max(0,Number(current||0)/max)):0;
  $('gauge-current').textContent=money(current);$('gauge-max').textContent=money(max);$('gauge-actual-text').textContent=money(c.volume_24h);$('gauge-pct').textContent=known(max)&&max>0?'占上限 '+fmt(ratio*100,1)+'%':'资金容量未知';$('gauge-fill').setAttribute('stroke-dasharray',ratio*100+' 100');$('gauge-needle').setAttribute('transform','rotate('+(-90+ratio*180)+' 110 110)');$('gauge-card').title=c.note||'等待任务和余额';
}
function render(){
  const s=state.status||{},f=state.funding||{};$('mode-pill').classList.toggle('live',s.dry_run===false);$('mode-pill').querySelector('b').textContent=s.dry_run===false?'实盘 · 会下单':'演练 · 不下单';$('meta-version').textContent=s.version||'—';$('meta-port').textContent=s.port||'—';$('conn-card').classList.toggle('degraded',!f.ready);$('conn-title').textContent=f.ready?'运行正常':f.funding_ready?'账户待授权':'数据读取失败';$('conn-sub').textContent=f.ready?(f.rows||[]).length+' 个共有市场':'行情与双所账户分别读取';showError([lastReadError,f.error].filter(Boolean).join('；'));renderAccounts();renderFunding();renderPositions();renderTasks();renderSystem();renderGauge();
}
$('menu-button').onclick=()=>{const open=document.querySelector('.sidebar').classList.toggle('open');$('menu-button').setAttribute('aria-expanded',String(open));};
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+b.dataset.page));document.querySelectorAll('[data-page]').forEach(n=>n.classList.toggle('active',n===b));$('page-title').textContent={funding:'资金费总览',tasks:'轮换任务',system:'系统'}[b.dataset.page];document.querySelector('.sidebar').classList.remove('open');$('menu-button').setAttribute('aria-expanded','false');});
function cancelEdit(){editing=null;$('f-asset').disabled=false;$('cancel-edit').hidden=true;$('f-save').textContent='＋ 保存任务';}
$('cancel-edit').onclick=cancelEdit;
$('task-form').onsubmit=e=>{e.preventDefault();action(async()=>{await api('tasks',{method:'POST',body:JSON.stringify({asset:$('f-asset').value,notional:$('f-notional').value,notional_max:$('f-notional-max').value||null,hold_hours:$('f-rotation').value,hold_hours_max:$('f-rotation-max').value||null,leverage:$('f-leverage').value||null,order_type:$('f-order-type').value,maker_wait_seconds:$('f-maker-wait').value,enabled:false})});cancelEdit();$('task-safety-note').textContent='任务已保存并停用；预检通过后再启用。';});};
$('f-asset').onchange=taskOptions;$('f-asset').onblur=renderAssets;$('f-order-type').onchange=taskOptions;
$('run-preflight').onclick=()=>action(async()=>{const box=$('preflight-box');box.style.display='block';try{const r=await api('preflight',{method:'POST',body:'{}'});box.textContent=r.checks.join('；')+'。预检通过，本次未下单。';}catch(e){box.textContent='预检未通过：'+e.message;throw e;}});
$('run-cycle').onclick=()=>{if(state.status?.dry_run===false&&!confirm('确认执行实盘一轮？启用中的任务可能真实开平仓。'))return;action(()=>api('cycle',{method:'POST',body:'{}'}));};
$('refresh-button').onclick=()=>refresh(true);$('cost-input').oninput=renderFunding;
const tools=document.createElement('div');tools.className='funding-tools';tools.innerHTML='<label>筛选币种 <input id="market-filter" aria-label="筛选币种" maxlength="24" placeholder="BTC"></label>';$('table-meta').before(tools);$('market-filter').oninput=e=>{filter=e.target.value;renderFunding();};
$('funding-body').closest('table').querySelectorAll('th').forEach((th,i)=>{const key=['asset','binance_bps_h','lighter_bps_h','net_bps_h',null,'net_bps_h','net_bps_h',null,'max_leverage'][i];if(key){const b=document.createElement('button');b.textContent=th.textContent+' ↕';b.onclick=()=>{descending=sortKey===key?!descending:true;sortKey=key;renderFunding();};th.replaceChildren(b);}});
$('export-orders').onclick=()=>{const cols=['at','venue','asset','side','reduce_only','client_id','state','filled','quote','fee'];const quote=v=>'"'+String(v??'').replace(/^[=+\-@]/,"'$&").replace(/"/g,'""')+'"';const csv='\uFEFF'+[cols,...(state.stats?.orders||[]).map(o=>cols.map(k=>k==='venue'?names[o[k]]:o[k]))].map(r=>r.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='hyperliquid_lighter-orders.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('hedge-console-active',()=>{resumeRead=true;if(!busy)void refresh();});
setInterval(()=>{$('clock').textContent=new Date().toLocaleTimeString('zh-CN',{hour12:false});},1000);refresh();setInterval(()=>{if(!busy&&!document.hidden&&consoleActive())refresh();},15000);
