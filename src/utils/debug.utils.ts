import _isError from "lodash/isError";
import _isNil from "lodash/isNil";
import _toString from "lodash/toString";

export const isDebug = () => (process.env.DEBUG_MODE || "").toLowerCase() === "true";

const ONE_LINER_DETAIL_MAX = 240;

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

/** Respects `NO_COLOR`, non-TTY stdout, and optional `LOG_COLOR=false`. */
const isLogColorEnabled = (): boolean => {
  if (process.stdout.isTTY !== true) {
    return false;
  }

  if ((process.env.NO_COLOR ?? "").trim() !== "") {
    return false;
  }

  return (process.env.LOG_COLOR ?? "true").toLowerCase() !== "false";
};

function paint(text: string, ...codes: string[]): string {
  if (!isLogColorEnabled()) {
    return text;
  }

  return `${codes.join("")}${text}${ANSI.reset}`;
}

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

const LEVEL_STYLE: Record<LogLevel, string[]> = {
  INFO: [ANSI.green, ANSI.bold],
  WARN: [ANSI.yellow, ANSI.bold],
  ERROR: [ANSI.red, ANSI.bold],
  DEBUG: [ANSI.magenta],
};

function coloredLevelTag(level: LogLevel): string {
  return paint(`[${level}]`, ...LEVEL_STYLE[level]);
}

function coloredScope(scope: string): string {
  if (!scope) {
    return "";
  }

  return paint(`${scope}:`, ANSI.cyan);
}

function coloredDetail(text: string): string {
  return paint(text, ANSI.gray);
}

function stringifyDetail(value: unknown): string {
  if (_isError(value)) {
    return value.stack ?? value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return _toString(value);
  }

  if (_isNil(value)) {
    return _toString(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return _toString(value);
  }
}

function compactOneLinerDetail(details: unknown[]): string {
  if (details.length === 0) {
    return "";
  }

  const joined = details.map(stringifyDetail).join(" ");
  const flat = joined.replace(/\s+/g, " ").trim();

  if (flat.length <= ONE_LINER_DETAIL_MAX) {
    return flat;
  }

  return `${flat.slice(0, ONE_LINER_DETAIL_MAX - 1)}…`;
}

function writeLog(level: LogLevel, scope: string, message: string, details: unknown[]): void {
  const writer = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;

  if (isDebug()) {
    const tag = coloredLevelTag(level);
    const scopeLabel = coloredScope(scope);

    writer(tag, scopeLabel, message, ...details);
    return;
  }

  const detail = compactOneLinerDetail(details);
  const plainTag = `[${level}]`;
  const plainPrefix = scope ? `${scope}: ` : "";
  const plainLine = detail
    ? `${plainTag} ${plainPrefix}${message} — ${detail}`
    : `${plainTag} ${plainPrefix}${message}`.replace(/\s+/g, " ").trim();

  if (!isLogColorEnabled()) {
    writer(plainLine);
    return;
  }

  const tag = coloredLevelTag(level);
  const scopeLabel = scope ? coloredScope(scope) : "";
  const body = detail ? `${message} ${coloredDetail(`— ${detail}`)}` : message;

  writer(`${tag} ${scopeLabel}${scopeLabel ? " " : ""}${body}`);
}

/** Colorizes an HTTP status code (2xx green, 3xx cyan, 4xx yellow, 5xx red). */
export function colorizeHttpStatus(status: number): string {
  const statusText = _toString(status);

  if (!isLogColorEnabled()) {
    return statusText;
  }

  if (status >= 500) {
    return paint(statusText, ANSI.red, ANSI.bold);
  }

  if (status >= 400) {
    return paint(statusText, ANSI.yellow);
  }

  if (status >= 300) {
    return paint(statusText, ANSI.cyan);
  }

  return paint(statusText, ANSI.green);
}

/** Colorizes an HTTP method (GET blue, POST green, others cyan). */
export function colorizeHttpMethod(method: string): string {
  if (!isLogColorEnabled()) {
    return method;
  }

  const upper = method.toUpperCase();

  if (upper === "GET") {
    return paint(upper, ANSI.blue, ANSI.bold);
  }

  if (upper === "POST") {
    return paint(upper, ANSI.green, ANSI.bold);
  }

  if (upper === "PUT" || upper === "PATCH") {
    return paint(upper, ANSI.yellow, ANSI.bold);
  }

  if (upper === "DELETE") {
    return paint(upper, ANSI.red, ANSI.bold);
  }

  return paint(upper, ANSI.cyan, ANSI.bold);
}

/** Always emitted; one line when debug is off, full detail when debug is on. */
export function logInfo(scope: string, message: string, ...details: unknown[]): void {
  writeLog("INFO", scope, message, details);
}

/** Always emitted; one line when debug is off, full detail when debug is on. */
export function logWarn(scope: string, message: string, ...details: unknown[]): void {
  writeLog("WARN", scope, message, details);
}

/** Always emitted; one line when debug is off, full detail when debug is on. */
export function logError(scope: string, message: string, ...details: unknown[]): void {
  writeLog("ERROR", scope, message, details);
}

/** Debug-only verbose log (no output when DEBUG_MODE is off). */
export const dlog = (...args: unknown[]) => {
  if (!isDebug()) {
    return;
  }

  const tag = coloredLevelTag("DEBUG");
  console.log(tag, ...args);
};
