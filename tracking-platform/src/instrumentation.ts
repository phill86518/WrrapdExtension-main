export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertCloudRunPersistence } = await import("@/lib/persistence-guard");
  assertCloudRunPersistence();
}
