const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export type SourcePathErrorCode =
  | "invalid_syntax"
  | "forbidden_segment"
  | "missing_value"
  | "unsupported_traversal";

export interface SourcePathError {
  ok: false;
  code: SourcePathErrorCode;
  message: string;
  path: string;
  segment?: string;
}

export interface SourcePathSuccess {
  ok: true;
  path: string;
  segments: string[];
  value: unknown;
}

export type SourcePathResult = SourcePathSuccess | SourcePathError;

function createError(
  code: SourcePathErrorCode,
  path: string,
  message: string,
  segment?: string,
): SourcePathError {
  return { ok: false, code, message, path, segment };
}

function decodeSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

export function parseSourcePath(path: string): SourcePathError | { ok: true; segments: string[] } {
  if (!path.startsWith("/")) {
    return createError(
      "invalid_syntax",
      path,
      "Source paths must start with '/'.",
    );
  }

  if (path === "/") {
    return createError(
      "invalid_syntax",
      path,
      "Source paths must point to a concrete field, not the root payload.",
    );
  }

  const rawSegments = path.slice(1).split("/");

  if (rawSegments.some((segment) => segment.length === 0)) {
    return createError(
      "invalid_syntax",
      path,
      "Source paths cannot contain empty path segments.",
    );
  }

  const segments = rawSegments.map(decodeSegment);
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) {
      return createError(
        "forbidden_segment",
        path,
        `Source paths cannot access reserved key '${segment}'.`,
        segment,
      );
    }

    if (
      segment === "." ||
      segment === ".." ||
      segment.includes("*") ||
      segment === "-"
    ) {
      return createError(
        "unsupported_traversal",
        path,
        `Source paths cannot use traversal syntax '${segment}'.`,
        segment,
      );
    }
  }

  return { ok: true, segments };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveSourcePath(payload: unknown, path: string): SourcePathResult {
  const parsed = parseSourcePath(path);
  if (!parsed.ok) {
    return parsed;
  }

  let current: unknown = payload;

  for (const segment of parsed.segments) {
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) {
        return createError(
          "unsupported_traversal",
          path,
          "Array access must use a concrete numeric index.",
          segment,
        );
      }

      const index = Number(segment);
      if (index >= current.length) {
        return createError(
          "missing_value",
          path,
          `Array index '${segment}' is outside the current payload.`,
          segment,
        );
      }

      current = current[index];
      continue;
    }

    if (!isObjectRecord(current)) {
      return createError(
        "missing_value",
        path,
        `Segment '${segment}' is outside the current payload.`,
        segment,
      );
    }

    if (!Object.hasOwn(current, segment)) {
      return createError(
        "missing_value",
        path,
        `Segment '${segment}' is outside the current payload.`,
        segment,
      );
    }

    current = current[segment];
  }

  return {
    ok: true,
    path,
    segments: parsed.segments,
    value: current,
  };
}
