import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venv = path.join(root, 'hedge-ops', '.venv');
const python = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const mode = process.argv[2] || 'start';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
    if (mode === 'start') {
      for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => child.kill(signal));
    }
  });
}

try {
  if (mode === 'setup') {
    try { await fs.access(python); } catch {
      const executable = process.env.HEDGE_OPS_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
      await run(executable, ['-m', 'venv', venv]);
    }
    // Install dependencies, not the two conflicting parallax_hedge packages.
    const script = "import pathlib,tomllib,subprocess,sys; root=pathlib.Path(sys.argv[1]); deps=set(); [deps.update(tomllib.loads((root/'engines'/e/'pyproject.toml').read_text(encoding='utf-8'))['project']['dependencies']) for e in ('lighter','entropy')]; constraints=root/'constraints.txt'; subprocess.check_call([sys.executable,'-m','pip','install',*(['-c',str(constraints)] if constraints.exists() else []),*sorted(deps),'pytest>=8','pytest-asyncio>=0.23'])";
    await run(python, ['-c', script, path.join(root, 'hedge-ops')]);
    console.log('套利对冲Ops 依赖已安装。运行 npm run hedge:start，再从平台启动所选引擎。');
  } else if (mode === 'start') {
    await fs.access(python).catch(() => { throw new Error('请先运行 npm run hedge:setup（需要 Python 3.11 或更高版本）'); });
    const runtime = path.resolve(process.env.HEDGE_OPS_DATA_DIR || path.join(root, '.runtime', 'hedge-ops'));
    await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
    const tokenFile = path.join(runtime, 'service-token');
    let token = process.env.HEDGE_OPS_SERVICE_TOKEN;
    if (!token) {
      token = await fs.readFile(tokenFile, 'utf8').then(v => v.trim()).catch(() => '');
      if (!token) {
        token = randomBytes(32).toString('hex');
        await fs.writeFile(tokenFile, token, { mode: 0o600, flag: 'wx' });
      }
    }
    if (token.trim().length < 32) throw new Error('HEDGE_OPS_SERVICE_TOKEN 至少需要 32 个字符');
    console.log('套利对冲Ops 服务正在启动，默认演练；交易引擎由平台页面按账户启动。');
    await run(python, [path.join(root, 'hedge-ops', 'gateway.py')], { env: { ...process.env, HEDGE_OPS_DATA_DIR: runtime, HEDGE_OPS_SERVICE_TOKEN: token, PYTHONUTF8: '1' } });
  } else if (mode === 'test') {
    for (const engine of ['lighter', 'entropy']) {
      await run(python, ['-m', 'pytest', '-p', 'no:cacheprovider', '-q', path.join(root, 'hedge-ops', 'engines', engine, 'tests')], {
        cwd: path.join(root, 'hedge-ops', 'engines', engine),
        env: { ...process.env, PYTHONPATH: path.join(root, 'hedge-ops', 'engines', engine, 'src'), PYTHONUTF8: '1' },
      });
    }
    await run(python, ['-m', 'pytest', '-p', 'no:cacheprovider', '-q', path.join(root, 'hedge-ops', 'tests')], { env: { ...process.env, PYTHONUTF8: '1' } });
  } else throw new Error('Usage: node scripts/hedge-ops.mjs setup|start|test');
} catch (error) { console.error(error.message); process.exitCode = 1; }
