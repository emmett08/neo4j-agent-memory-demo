import type { MemoryEvent } from "../types.js";

export interface EventBus {
  emit(event: Omit<MemoryEvent, "at">): void;
}

export class NullEventBus implements EventBus {
  emit(_event: Omit<MemoryEvent, "at">): void {}
}

export class CallbackEventBus implements EventBus {
  constructor(private cb?: (event: MemoryEvent) => void) {}

  emit(event: Omit<MemoryEvent, "at">): void {
    if (!this.cb) return;
    try {
      this.cb({ ...event, at: new Date().toISOString() });
    } catch {
      // never allow callbacks to break core flows
    }
  }
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export class NullLogger implements Logger {
  info(_msg: string, _meta?: Record<string, unknown>): void {}
  warn(_msg: string, _meta?: Record<string, unknown>): void {}
  error(_msg: string, _meta?: Record<string, unknown>): void {}
}

