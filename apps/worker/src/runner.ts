export interface BackgroundTask { name: string; run(signal: AbortSignal): Promise<void> }
// Tasks will be supplied by the durable job dispatcher in Stage 1.2.
export async function runTasks(tasks: readonly BackgroundTask[], signal: AbortSignal): Promise<void> {
  for (const task of tasks) { if (signal.aborted) return; await task.run(signal); }
}
