import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const mode = process.argv[2] === "start" ? "start" : "dev";
const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const gridServer = path.join(root, "grid-ops", "src", "launcher.js");
const children = new Set();
let stopping = false;

function gridIsRunning() {
  return new Promise((resolve) => {
    const request = http.get("http://127.0.0.1:8080/api/overview", (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(800, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

function launch(args) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 150);
}

if (!(await gridIsRunning())) {
  const grid = launch([gridServer]);
  grid.once("exit", (code) => {
    if (!stopping && code !== 0) shutdown(code ?? 1);
  });
}

const next = launch([nextBin, mode]);
next.once("exit", (code) => shutdown(code ?? 0));

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
