export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installMonitoring, captureMessage } = await import("./lib/monitoring");
  installMonitoring();
  captureMessage("Server instrumentation registered", "debug", {
    scope: "instrumentation",
  });
}
