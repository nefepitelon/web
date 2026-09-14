import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

export class Docker {
  constructor(binary = 'docker') { this.binary = binary; }
  async exec(args, timeout = 20000) {
    try {
      const { stdout } = await execFileAsync(this.binary, args, { timeout, maxBuffer: 512 * 1024, windowsHide: true, shell: false });
      return stdout.trim();
    } catch (error) {
      // Docker/engine output can contain connection strings. Never return it to callers.
      const safe = new Error('Docker 命令失败；请在运行主机检查服务和容器日志。');
      safe.code = error.code;
      safe.missing = /No such (?:object|container|image)/i.test(error.stderr ?? '');
      throw safe;
    }
  }
  async inspect(name) {
    try {
      const state = JSON.parse(await this.exec(['container', 'inspect', '--format', '{{json .State}}', name]));
      return { running: state.Running === true, exitCode: state.ExitCode, startedAt: state.StartedAt, finishedAt: state.FinishedAt };
    } catch (error) { if (error.missing) return null; throw error; }
  }
  async image(image) { await this.exec(['image', 'inspect', '--format', '{{.Id}}', image]); }
  async available() { await this.exec(['version', '--format', '{{.Server.Version}}']); }
  async stop(name) { return this.exec(['stop', '--time', '60', name], 75000); }
}
