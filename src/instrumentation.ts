export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installMonitoring, captureMessage } = await import("./lib/monitoring");
  const { logPaymentRecipientConfigWarning } = await import("./lib/config");
  installMonitoring();
  logPaymentRecipientConfigWarning();
  captureMessage("Server instrumentation registered", "debug", {
    scope: "instrumentation",
  });
}
