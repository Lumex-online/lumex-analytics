import cron, { type ScheduledTask } from "node-cron";
import { env } from "./config/env.js";
import { closeMongoClient } from "./database/mongo.js";
import { jobs, type JobDefinition } from "./jobs.js";

let running = false;
const activeTasks: ScheduledTask[] = [];

async function executeJob(job: JobDefinition): Promise<void> {
  if (running) {
    console.log(`[runner] skipping ${job.key} — previous job still running`);
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    await job.handler();
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[runner] ${job.key} failed after ${Date.now() - startedAt}ms\n${message}`);
  } finally {
    running = false;
    console.log(`[runner] ${job.key} finished in ${Date.now() - startedAt}ms`);
  }
}

export async function runOnce(filterKey?: string): Promise<void> {
  const selected = filterKey ? jobs.filter((job) => job.key === filterKey) : jobs;
  if (selected.length === 0) {
    console.error(`[runner] no job matches "${filterKey ?? ""}". Available: ${jobs.map((j) => j.key).join(", ")}`);
    return;
  }
  for (const job of selected) {
    await executeJob(job);
  }
}

export function startScheduler(): void {
  for (const job of jobs) {
    if (!cron.validate(job.schedule)) {
      console.error(`[runner] invalid cron expression for ${job.key}: ${job.schedule}`);
      continue;
    }
    const task = cron.schedule(job.schedule, () => {
      void executeJob(job);
    });
    activeTasks.push(task);
    console.log(`[runner] scheduled ${job.key} on "${job.schedule}"`);
  }
}

export function stopScheduler(): void {
  for (const task of activeTasks) {
    task.stop();
  }
  activeTasks.length = 0;
}

export async function shutdown(code = 0): Promise<void> {
  stopScheduler();
  await closeMongoClient();
  process.exit(code);
}

export function isRunOnceMode(argv: string[]): { mode: "once"; key?: string } | { mode: "schedule" } {
  const onceIndex = argv.findIndex((arg) => arg === "--once" || arg === "-1");
  if (onceIndex === -1) {
    return { mode: "schedule" };
  }
  const next = argv[onceIndex + 1];
  if (next && !next.startsWith("-")) {
    return { mode: "once", key: next };
  }
  return { mode: "once" };
}

export function shouldRunOnBoot(): boolean {
  return env.ETL_RUN_ON_BOOT;
}
