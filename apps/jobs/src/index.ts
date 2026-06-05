import {
  isRunOnceMode,
  runOnce,
  shouldRunOnBoot,
  shutdown,
  startScheduler
} from "./runner.js";

async function main(): Promise<void> {
  const mode = isRunOnceMode(process.argv.slice(2));

  if (mode.mode === "once") {
    await runOnce(mode.key);
    await shutdown(0);
    return;
  }

  startScheduler();

  if (shouldRunOnBoot()) {
    console.log("[runner] ETL_RUN_ON_BOOT=true — running all jobs immediately");
    await runOnce();
  }

  const onSignal = (signal: NodeJS.Signals) => {
    console.log(`[runner] received ${signal}, shutting down`);
    void shutdown(0);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
}

void main().catch(async (error) => {
  console.error("[runner] fatal error", error);
  await shutdown(1);
});
