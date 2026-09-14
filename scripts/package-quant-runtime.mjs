import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = path.join(root, 'public', 'downloads');
await mkdir(outputDirectory, {recursive:true});
const runtimeDirectory = path.join(root, 'quant-runtime');
const allowedDirectories = ['bin', 'lib', 'recipes', 'test', 'deploy', 'local-engines', 'local-console', 'windows'];
const sourceFiles = [];
async function collect(directory, prefix) {
  let entries;
  try {entries = await readdir(directory, {withFileTypes:true});} catch (error) {if (error.code === 'ENOENT') return; throw error;}
  for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.') || ['node_modules','__pycache__','settings','state','data','project','tenants'].includes(entry.name) || /\.(?:pyc|key|pem|env)$/.test(entry.name) || ['api-auth.json','deployment.json','device.json'].includes(entry.name)) continue;
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(path.join(directory,entry.name),name);
    else sourceFiles.push({name, source:path.join(directory,entry.name)});
  }
}
for (const directory of allowedDirectories) await collect(path.join(runtimeDirectory,directory),`quant-runtime/${directory}`);
for (const filename of ['package.json','README.md','server.mjs']) sourceFiles.push({name:`quant-runtime/${filename}`,source:path.join(runtimeDirectory,filename)});
for (const required of ['quant-runtime/bin/local-console.mjs','quant-runtime/bin/pull-worker.mjs','quant-runtime/bin/install-engine.mjs','quant-runtime/windows/launch.ps1']) {
  if (!sourceFiles.some(file=>file.name===required)) throw new Error(`Missing required runtime source: ${required}`);
}
const hash = createHash('sha256');
for (const file of sourceFiles) {hash.update(file.name); hash.update('\0'); hash.update(await readFile(file.source)); hash.update('\0');}
const buildId = hash.digest('hex').slice(0,16);
const version = JSON.parse(await readFile(path.join(runtimeDirectory,'package.json'),'utf8')).version;
const output = createWriteStream(path.join(outputDirectory, 'welinkbtc-quant-runtime.zip'));
const archive = archiver('zip', {zlib:{level:9}});
const completion = new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);archive.on('error',reject);});
archive.pipe(output);
// Explicit source directories only. Device credentials, accounts and state never ship.
for (const file of sourceFiles) archive.file(file.source,{name:file.name,date:new Date('2000-01-01T00:00:00Z')});
archive.append(`${JSON.stringify({schemaVersion:1,version,buildId},null,2)}\n`,{name:'quant-runtime/build.json',date:new Date('2000-01-01T00:00:00Z')});
await archive.finalize();
await completion;
const bytes = await readFile(path.join(outputDirectory,'welinkbtc-quant-runtime.zip'));
await writeFile(path.join(outputDirectory,'welinkbtc-quant-runtime-manifest.json'),`${JSON.stringify({schemaVersion:1,version,buildId,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length},null,2)}\n`);
const launcher = (await readFile(path.join(runtimeDirectory,'windows','launch.ps1'),'utf8')).replace(/^\uFEFF/,'').replace(/\r?\n/g,'\r\n');
await writeFile(path.join(outputDirectory,'quant-suite-launch.ps1'),`\uFEFF${launcher}`,'utf8');
const batch = (await readFile(path.join(root,'启动量化交易集.bat'),'utf8')).replace(/\r?\n/g,'\r\n');
await writeFile(path.join(outputDirectory,'启动量化交易集.bat'),batch,'utf8');
console.log(`Quant runtime source package: ${archive.pointer()} bytes / ${sourceFiles.length} sources / build ${buildId}`);
