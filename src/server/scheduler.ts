import { deliverDuePetals } from "./deliver";

let timer: ReturnType<typeof setInterval> | null = null;

export function startScheduler(): void {
  if (process.env.BLOOM_SCHEDULER === "off" || timer) return;
  const tick = () => {
    deliverDuePetals().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "scheduler failed";
      console.error(JSON.stringify({ level: "error", area: "scheduler", message }));
    });
  };
  timer = setInterval(tick, 10_000);
  if (typeof timer === "object" && timer && "unref" in timer) timer.unref();
  tick();
}
