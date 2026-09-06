import { runLoop } from "../loop";

const once = process.argv.includes("--once");
await runLoop({ once });
