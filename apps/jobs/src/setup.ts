async function main(): Promise<void> {
  console.log("[setup] Mongo analytics setup lives in @lumex/api: npm run db:setup --workspace @lumex/api");
}

void main()
  .catch((error) => {
    console.error("[setup] failed", error);
    process.exitCode = 1;
  })
