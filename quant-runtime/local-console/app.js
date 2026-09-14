const $ = id => document.getElementById(id);
const csrf = document.querySelector('meta[name="local-csrf"]').content;
let current = null, pending = false, credentialTimer = null;
const descriptions = {
  freqtrade: ['FT', '趋势 · 波段 · 回测', '原版 FreqUI 提供策略图表、回测与交易记录。首次安装启动研究 Web 服务。'],
  nautilus: ['NT', '事件驱动 · 多市场', '安装 NautilusTrader 原生 SDK。上游没有独立 Web 面板，研究与执行通过代码及网站控制台完成。'],
  hummingbot: ['HB', '做市 · 套利 · 连接器', '安装原版 Dashboard 与 Hummingbot API，进入其策略及机器人管理界面。'],
  lean: ['LN', '多资产 · 研究 · 组合', '安装 LEAN 原生引擎。开源引擎使用命令行与算法文件，不包含 QuantConnect 云端网站。'],
  jesse: ['JS', '研究 · 优化 · 分析', '安装 Jesse 原版 Dashboard。实盘及部分高级功能仍取决于上游商业许可。'],
  octobot: ['OB', '低代码 · 网格 · DCA', '启动 OctoBot 原版 Web 界面与模拟环境，在原生界面管理配置及机器人。'],
};
const connectionLabels = {disconnected: '尚未连接', connecting: '正在连接', connected: '已连接网站', reconnecting: '连接中断 · 正在重试', disconnecting: '正在结束连接'};
function notice(text, error = false) { $('notice').hidden = !text; $('notice').textContent = text; $('notice').className = error ? 'error' : 'success'; }
function textNode(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function render(data) {
  current = data;
  $('connection').textContent = connectionLabels[data.connection] || '未知状态'; $('connection').dataset.state = data.connection;
  $('last-sync').textContent = data.lastSyncAt ? `最近同步 ${new Date(data.lastSyncAt).toLocaleTimeString('zh-CN')}` : '尚未同步网站配置';
  $('connect').disabled = pending || !data.paired || data.connection !== 'disconnected'; $('disconnect').disabled = pending || data.connection === 'disconnected' || data.connection === 'disconnecting';
  $('paired-badge').textContent = data.paired ? '已配对' : '未配对';
  $('device-detail').textContent = data.device ? `${data.device.workerId} · ${data.device.baseUrl}` : '在网站的执行器页面创建设备，复制配对 JSON 后粘贴到这里。';
  if (data.paired && !$('pairing').value) { $('pair-form').hidden = true; $('change-pairing').hidden = false; }
  $('change-pairing').disabled = data.connection !== 'disconnected' || pending;
  $('live-status').textContent = data.liveEnabled ? '本次会话实盘执行已解锁' : '实盘执行已锁定';
  $('live-toggle').textContent = data.liveEnabled ? '锁定实盘执行' : '解锁本次实盘执行'; $('live-toggle').disabled = pending || !data.paired;
  const diag = data.diagnostics; const env = $('environment'); env.replaceChildren();
  for (const [key, value] of [['Node.js', diag?.node || '等待检查'], ['Docker', !diag ? '等待检查' : diag.dockerReady ? 'Linux 引擎可用' : diag.dockerInstalled ? '未启动或非 Linux 模式' : '未检测到 Docker'], ['WSL 2', diag?.platform !== 'win32' ? '非 Windows 环境' : diag.wslAvailable ? '可用' : '尚未确认']]) { const row = document.createElement('div'); row.append(textNode('dt', key), textNode('dd', value)); env.append(row); }
  $('docker-help').open = Boolean(diag && !diag.dockerReady);
  const grid = $('engines'); grid.replaceChildren();
  for (const engine of data.engines) {
    const [symbol, category, description] = descriptions[engine.id];
    const card = document.createElement('article'); card.className = `engine-card ${engine.id}`;
    const top = document.createElement('div'); top.className = 'engine-top'; top.append(textNode('span', symbol, 'engine-icon'), textNode('span', engine.status === 'stopped' ? '已停止' : engine.installed ? '已安装' : engine.status === 'failed' ? '安装失败' : '尚未安装', 'tag')); card.append(top, textNode('h3', engine.name), textNode('p', category, 'category'), textNode('p', description, 'description'));
    card.append(textNode('p', (engine.assigned ? `${engine.mode.toUpperCase()} · ${engine.configName} · 配置 v${engine.revision}` : '请先在网站保存配置并连接同步。') + (engine.halted ? ' · 本地停机锁定，重新验证后才可恢复执行。' : ''), 'config-summary'));
    const actions = document.createElement('div'); actions.className = 'button-row';
    const install = textNode('button', engine.installed ? '检查 / 继续安装' : '安装原生引擎'); install.disabled = pending || data.operation?.status === 'running' || !engine.assigned || data.connection !== 'connected' || !diag?.dockerReady; install.addEventListener('click', () => act('/api/install', {engine: engine.id})); actions.append(install);
    if (engine.uiUrl) { const link = textNode('a', '打开原版界面 ↗', 'native-link'); link.href = engine.uiUrl; link.target = '_blank'; link.rel = 'noreferrer'; actions.append(link); }
    if (engine.installed && engine.status !== 'stopped') { const stop = textNode('button', '停止本机服务'); stop.disabled = pending || data.operation?.status === 'running'; stop.addEventListener('click', () => { if (window.confirm(`停止 ${engine.name} 的本机原生服务？持久数据会保留，交易所订单与持仓仍须单独核对。`)) act('/api/stop-engine', {engine: engine.id, confirmation: `STOP ${engine.id}`}); }); actions.append(stop); }
    if (engine.installed && ['freqtrade', 'hummingbot', 'jesse'].includes(engine.id)) { const credentials = textNode('button', '查看本机登录'); credentials.disabled = pending; credentials.addEventListener('click', () => showCredentials(engine.id)); actions.append(credentials); }
    if (engine.status === 'stopped' && ['freqtrade', 'hummingbot', 'jesse', 'octobot'].includes(engine.id)) { const resumeUi = textNode('button', '仅恢复原版界面'); resumeUi.disabled = pending || data.operation?.status === 'running' || !engine.assigned || !diag?.dockerReady; resumeUi.addEventListener('click', () => { const confirmation = window.prompt(`只打开 ${engine.name} 的本机原版界面以配置数据。网站连接会断开，本地停机锁保留，不恢复云端研究或交易调度。请输入 RESUME UI ${engine.id}：`, ''); if (confirmation === `RESUME UI ${engine.id}`) act('/api/resume-ui', {engine: engine.id, confirmation}); }); actions.append(resumeUi); }
    if (engine.installed) { const verify = textNode('button', engine.halted || engine.status === 'stopped' ? '验证并恢复研究 / 界面' : '验证原生研究'); verify.disabled = pending || data.operation?.status === 'running' || !engine.assigned || !diag?.dockerReady; verify.addEventListener('click', () => { const resume = engine.halted || engine.status === 'stopped'; if (resume) { const confirmation = window.prompt(`将运行原生历史回测，检查配置后恢复研究调度和原版界面，不启动交易。请输入 RESUME ${engine.id}：`, ''); if (confirmation === `RESUME ${engine.id}`) act('/api/verify-engine', {engine: engine.id, resume: true, confirmation}); } else if (window.confirm('即将暂停接收网站新指令并运行原生历史回测。可能需要下载历史行情并占用本机计算资源。此操作仅验证研究能力，不授权实盘。')) act('/api/verify-engine', {engine: engine.id, resume: false, confirmation: `VERIFY ${engine.id}`}); }); actions.append(verify); }
    if (data.device) { const link = textNode('a', '网站配置 ↗', 'native-link'); link.href = `${data.device.baseUrl}/quant-suite/${engine.id}/control`; link.target = '_blank'; link.rel = 'noreferrer'; actions.append(link); }
    card.append(actions); grid.append(card);
  }
  $('operation').textContent = {running: '安装进行中', completed: '安装完成', failed: '安装未完成'}[data.operation?.status] || '空闲';
  $('operation-message').textContent = (data.operation?.message || '尚无安装任务。') + (data.operation?.credentialsFile ? ` 原生登录信息文件：${data.operation.credentialsFile}` : '');
  $('logs').textContent = data.logs.length ? data.logs.map(log => `${new Date(log.at).toLocaleTimeString('zh-CN')}  ${log.level === 'error' ? '[错误] ' : ''}${log.message}`).join('\n') : '等待操作…';
  if (data.lastError) notice(data.lastError, true);
}
async function act(url, body = {}) {
  if (pending) return; pending = true; notice(''); if (current) render(current);
  try { const response = await fetch(url, {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json', 'x-local-csrf': csrf}, body: JSON.stringify(body)}); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message || '请求失败。'); if (url === '/api/pair') { $('pairing').value = ''; $('pair-form').hidden = true; } render(data); notice(url === '/api/pair' ? '设备配对已保存。点击「连接网站」开始同步。' : url === '/api/install' ? '安装任务已提交，进度将显示在本机操作记录。' : '操作已完成。'); }
  catch (error) { notice(error.message, true); }
  finally { pending = false; if (current) render(current); }
}
function hideCredentials() { clearTimeout(credentialTimer); $('credentials-value').textContent = ''; $('credentials-purpose').textContent = ''; $('credentials-dialog').close(); }
async function showCredentials(engine) {
  try { const response = await fetch('/api/credentials', {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json', 'x-local-csrf': csrf}, body: JSON.stringify({engine, confirmation: `VIEW ${engine}`})}); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message || '无法查看本机登录信息。'); $('credentials-value').textContent = `${data.username ? `用户名：${data.username}\n` : ''}密码：${data.password}`; $('credentials-purpose').textContent = data.purpose; $('credentials-dialog').showModal(); clearTimeout(credentialTimer); credentialTimer = setTimeout(hideCredentials, 30000); }
  catch (error) { notice(error.message, true); }
}
$('credentials-close').addEventListener('click', hideCredentials); $('credentials-dialog').addEventListener('cancel', hideCredentials); $('credentials-dialog').addEventListener('close', () => { $('credentials-value').textContent = ''; });
$('pair-form').addEventListener('submit', event => { event.preventDefault(); try { act('/api/pair', JSON.parse($('pairing').value)); } catch { notice('配对内容必须是网站生成的有效 JSON。', true); } });
$('change-pairing').addEventListener('click', () => { $('pair-form').hidden = false; $('change-pairing').hidden = true; $('pairing').focus(); });
$('connect').addEventListener('click', () => act('/api/connect'));
$('disconnect').addEventListener('click', () => act('/api/disconnect'));
$('diagnostics').addEventListener('click', () => act('/api/diagnostics'));
$('live-toggle').addEventListener('click', () => { if (current?.liveEnabled) return act('/api/live', {enabled: false}); const confirmation = window.prompt('解锁后，此设备可执行网站授权且通过原生校验的实盘指令。此操作本身不会启动交易。请输入 ENABLE LOCAL LIVE：', ''); if (confirmation === 'ENABLE LOCAL LIVE') act('/api/live', {enabled: true, confirmation}); else if (confirmation !== null) notice('确认文本不匹配，实盘执行仍锁定。', true); });
async function refresh() { if (pending) return; try { const response = await fetch('/api/status', {credentials: 'same-origin', cache: 'no-store'}); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.message); render(data); } catch { notice('本机控制台连接中断。请保持启动器窗口运行，或重新双击启动器。', true); } }
refresh(); setInterval(refresh, 3000);
