"""Generate pair-specific static consoles from the single native UI template."""
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'hedge-ops'))
from paired_hedge.config import PAIRS, NAMES, defaults

for pair,(left,right) in PAIRS.items():
    folder=ROOT/'hedge-ops/paired_hedge/web'/pair
    folder.mkdir(parents=True,exist_ok=True)
    (ROOT/'hedge-ops/paired_hedge'/f'{pair}.env.example').write_text(''.join(k+'='+v+'\n' for k,v in defaults(pair).items()),encoding='utf-8')
    for filename in ('index.html','app.js','styles.css'):
        text=(ROOT/'hedge-ops/binance_lighter/web'/filename).read_text(encoding='utf-8')
        text=text.replace('Lighter Core','__RIGHT__').replace('Binance',NAMES[left]).replace('Lighter',NAMES[right]).replace('__RIGHT__',NAMES[right])
        text=text.replace('BINANCE × LIGHTER CORE',f'{NAMES[left].upper()} × {NAMES[right].upper()}')
        left_sub={'binance':'USD-M · USDT 永续','hyperliquid':'原生 · USDC 永续'}[left]
        right_sub={'okx':'SWAP · USDT 永续','hyperliquid':'原生 · USDC 永续','lighter':'Core · USDC 永续'}[right]
        text=text.replace('USD-M · USDT 永续',left_sub).replace('Core · USDC 永续',right_sub)
        # Rates, permissions and account requirements differ; do not copy the
        # Lighter 8-hour interpretation onto OKX or native Hyperliquid.
        if filename=='app.js':
            start=text.index("  $('diagnostics').innerHTML=")
            end=text.index('\n',start)
            text=text[:start]+"  $('diagnostics').innerHTML=Object.entries(state.funding?.errors||{}).map(([v,e])=>'<p class=\"diagnostic-error\">'+esc(names[v]||v)+': '+esc(e)+'</p>').join('')+'<h3>账户与交易控制</h3><p>每个控制台使用独立交易账户和专用 API 凭据。Binance 要求单向、单资产 USD-M；OKX 要求单币种保证金、净持仓及全仓；Hyperliquid 使用原生 USDC 永续、已授权 agent 和资金账户地址；Lighter 使用 Core 实例。实盘预检不发送订单，首次成交仍须核对交易所。</p><h3>执行与恢复</h3><p>先记录订单意图，再发送订单；只按终态实际成交数量对冲。未知结果暂停并按原客户端订单号恢复，不重复报单。仅撤销本任务订单、仅减仓处理本任务仓位。杠杆仅在双腿空仓时设置并读回确认。手续费未知时显示未知，统计不包含资金费及外部交易。</p>';"+text[end:]
            text=text.replace("esc(r.asset)}USDT / ${esc(r.asset)} · "+NAMES[left]+" ${esc(r.binance_interval_h)}h", "esc(r.asset)} · "+NAMES[left]+" ${esc(r.binance_interval_h)}h / "+NAMES[right]+" ${esc(r.lighter_interval_h)}h")
            text=text.replace("' bps（B '",repr(' bps（'+NAMES[left]+' ')).replace("' / L '",repr(' / '+NAMES[right]+' '))
            text=text.replace('B ${known(r.binance_max_leverage)',NAMES[left]+' ${known(r.binance_max_leverage)').replace(' / L ${known(r.lighter_max_leverage)',' / '+NAMES[right]+' ${known(r.lighter_max_leverage)')
            text=text.replace("'binance-lighter-orders.csv'",repr(pair+'-orders.csv'))
            text=text.replace('cols.map(k=>o[k])',"cols.map(k=>k==='venue'?names[o[k]]:o[k])")
        if filename=='index.html':
            import re
            notes={'binance':'Binance 按官方实际结算周期换算','okx':'OKX 按相邻官方结算时间换算','hyperliquid':'Hyperliquid 原生资金费为每小时值','lighter':'Lighter 8 小时等值报价除以 8'}
            text=re.sub(r'(<b>资金费统一为 bps / 小时；行情展示与账户读取独立。</b> ).*?开仓另行检查基差、盘口深度、滑点、保证金与仓位归属。',lambda m:m[1]+notes[left]+'；'+notes[right]+'。开仓另行检查基差、盘口深度、滑点、保证金与仓位归属。',text)
            text=text.replace('USDT/USDC','两所稳定币').replace('USDT / USDC','两所稳定币')
        (folder/filename).write_text(text.replace('1.3.2','1.4.0'),encoding='utf-8')

schema_path=ROOT/'lib/hedge-ops/schema.json'
schema=json.loads(schema_path.read_text(encoding='utf-8'))
schema['defaults'].update({pair:defaults(pair) for pair in PAIRS})
schema['labels'].update({'OKX_API_KEY':'OKX API Key（交易权限）','OKX_API_SECRET':'OKX API Secret','OKX_API_PASSPHRASE':'OKX API Passphrase','OKX_REGION':'OKX 注册地区（global / us / eea）','OKX_PROXY':'OKX 代理','HYPERLIQUID_PROXY':'Hyperliquid 代理','HYPERLIQUID_VAULT_ADDRESS':'Hyperliquid 子账户地址（主账户留空）'})
schema_path.write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
