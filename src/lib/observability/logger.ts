export type LogFields = Record<string, unknown>;

const MAX_STRING = 8000;

function truncate(s: string): string {
  if (s.length <= MAX_STRING) return s;
  return `${s.slice(0, MAX_STRING)}…(truncated)`;
}

function sanitizeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return truncate(v.replace(/\s+/g, " ").trim());
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Error) {
    return { name: v.name, message: truncate(v.message), stack: truncate(v.stack ?? "") };
  }
  if (typeof v === "object") {
    try {
      return JSON.parse(JSON.stringify(v, replacer)) as unknown;
    } catch {
      return "[unserializable]";
    }
  }
  return String(v);
}

function replacer(_key: string, val: unknown): unknown {
  if (typeof val === "string" && val.length > MAX_STRING) {
    return truncate(val);
  }
  return val;
}

function sanitizeFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = sanitizeValue(v) as unknown;
  }
  return out;
}

function useJson(): boolean {
  const fmt = process.env.OBSERVABILITY_LOG_FORMAT;
  if (fmt === "text") return false;
  if (fmt === "json") return true;
  return process.env.NODE_ENV === "production";
}

function baseRecord(level: string, msg: string, fields?: LogFields) {
  return {
    ts: new Date().toISOString(),
    level,
    msg,
    service: process.env.OBSERVABILITY_SERVICE ?? "versatil-worker",
    env: process.env.NODE_ENV ?? "development",
    ...sanitizeFields(fields),
  };
}

function emit(level: "info" | "warn" | "error", msg: string, fields?: LogFields) {
  const record = baseRecord(level, msg, fields);
  if (useJson()) {
    const line = JSON.stringify(record);
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }
  } else {
    const extra = fields ? ` ${JSON.stringify(sanitizeFields(fields))}` : "";
    const prefix = `[${record.ts}] [${level}] [${record.service}] ${msg}`;
    if (level === "error") {
      console.error(prefix + extra);
    } else if (level === "warn") {
      console.warn(prefix + extra);
    } else {
      console.log(prefix + extra);
    }
  }
}

export const log = {
  info(msg: string, fields?: LogFields) {
    emit("info", msg, fields);
  },
  warn(msg: string, fields?: LogFields) {
    emit("warn", msg, fields);
  },
  error(msg: string, fields?: LogFields) {
    emit("error", msg, fields);
  },
};
