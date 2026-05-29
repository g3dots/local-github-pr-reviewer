#!/usr/bin/env node
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = resolve(__dirname, "..", "data", "reviewer.pid");

if (!existsSync(PID_FILE)) {
  console.log("no reviewer.pid found — nothing to stop.");
  process.exit(0);
}

const pid = Number(readFileSync(PID_FILE, "utf8").trim());
if (!Number.isFinite(pid) || pid <= 0) {
  console.log("reviewer.pid is empty or invalid; clearing it.");
  unlinkSync(PID_FILE);
  process.exit(0);
}

try {
  process.kill(pid, 0);
} catch {
  console.log(`pid ${pid} is not alive; clearing the pid file.`);
  unlinkSync(PID_FILE);
  process.exit(0);
}

try {
  process.kill(pid, "SIGTERM");
  console.log(`sent SIGTERM to reviewer (pid ${pid}).`);
} catch (e) {
  console.error(`failed to signal pid ${pid}: ${e.message}`);
  process.exit(1);
}

// Wait briefly and verify it exited.
const start = Date.now();
const wait = () => {
  try {
    process.kill(pid, 0);
    if (Date.now() - start > 5000) {
      console.error(`pid ${pid} still alive after 5s. Try: kill -9 ${pid}`);
      process.exit(1);
    }
    setTimeout(wait, 100);
  } catch {
    console.log(`reviewer (pid ${pid}) stopped.`);
    process.exit(0);
  }
};
setTimeout(wait, 100);
