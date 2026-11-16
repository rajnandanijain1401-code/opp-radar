import pino from "pino";

export type Logger = pino.Logger;

/** Structured logger. Writes to stderr so `--json` output on stdout stays clean. */
export function createLogger(level = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({ level, base: { app: "opp-radar" } }, pino.destination(2));
}

/** A logger that discards everything (tests). */
export function silentLogger(): Logger {
  return pino({ level: "silent" });
}
