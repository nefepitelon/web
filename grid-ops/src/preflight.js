// The local console is the place where users repair network and proxy settings,
// so network availability must never be a prerequisite for starting it.
// Per-target diagnostics and safe route selection run inside server.js. Any
// unavailable LIVE exchange stays offline and cannot start or resume a grid.
console.log('[启动检查] ✓ 本地控制台允许启动；网络检测将在控制台中继续执行。');
console.log('[启动检查] 网络异常只会让对应 LIVE 交易所保持离线，不会阻止进入“IP 配置”。');
