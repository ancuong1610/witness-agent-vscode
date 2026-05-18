// ---------------------------------------------------------------------------
// telemetryWriter.ts — local OTel-style event writer (v2.1)
// ---------------------------------------------------------------------------
//
// Appends structured JSON events to `.witness/telemetry/otel/events.jsonl`.
//
// Design invariants:
//   - All public functions are fire-and-forget: they never throw to callers.
//   - Telemetry write failures never affect command execution.
//   - No raw workspace filesystem paths are written to disk.
//   - No prompt text, chat transcripts, file contents, or reasoning is stored.
//   - Artifact paths stored in events are workspace-relative logical paths only.
//
// Transport: local JSONL file only (v2.1). OTLP export is deferred to a later
// release. The event schema is OTel-compatible to ease that future migration.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import * as path from 'path';
import packageJson from '../../package.json';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Subdirectory under `.witness/telemetry/` that holds the event log. */
const OTEL_SUBDIR = 'otel';

/** Filename of the append-only event log inside OTEL_SUBDIR. */
const EVENTS_FILENAME = 'events.jsonl';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The three terminal states a Witness command can reach.
 *
 * - `"success"`   — command completed and the primary artifact was written.
 * - `"cancelled"` — user dismissed a QuickPick or InputBox.
 * - `"error"`     — an unhandled exception occurred during command execution.
 */
export type WitnessTelemetryStatus = 'success' | 'cancelled' | 'error';

/**
 * A single telemetry event as stored in `events.jsonl`.
 *
 * All fields are always present. Fields that are not applicable for a given
 * event are set to `null`, an empty array, or an empty object as appropriate.
 */
export interface WitnessTelemetryEvent {
  /** UTC ISO 8601 timestamp at the moment of event emission. */
  timestamp: string;

  /** OTel-compatible event name, e.g. `"witness.session.started"`. */
  event_name: string;

  /** Extension version string read from package.json at module load time. */
  extension_version: string;

  /**
   * SHA-256 hash of the workspace root filesystem path, formatted as
   * `"sha256:<hex>"`. Allows correlating events across runs in the same
   * workspace without storing the raw path.
   *
   * `null` when no workspace root is available.
   */
  workspace_root_hash: string | null;

  /**
   * The active session ID at the time of command execution (e.g.
   * `"2026-05-14-001"`), or `null` if no session was active.
   */
  session_id: string | null;

  /** VS Code command ID that triggered this event (e.g. `"witness.startSession"`). */
  command_id: string;

  /**
   * Workspace-relative logical paths of artifacts written by the command.
   * Uses forward slashes regardless of OS. Empty array if no artifacts were
   * written (e.g. on cancellation or error).
   */
  artifact_paths: string[];

  /** Terminal status of the command execution. */
  status: WitnessTelemetryStatus;

  /**
   * Elapsed milliseconds from command entry to event emission, or `null` if
   * the duration was not measurable.
   */
  duration_ms: number | null;

  /**
   * Command-specific metadata attributes. Values are scalars, arrays of
   * scalars, or nested plain objects. Functions, `undefined`, symbols, and
   * circular references are dropped during serialization.
   *
   * Must not contain raw file content, prompt text, chat transcripts, absolute
   * filesystem paths, or any personally identifiable information.
   */
  attributes: Record<string, unknown>;
}

/**
 * Parameters passed to {@link emitWitnessEvent}.
 */
export interface EmitWitnessEventParams {
  /** URI of the workspace root, or `undefined` if no workspace is open. */
  workspaceRoot: vscode.Uri | undefined;

  /** OTel-compatible event name (e.g. `"witness.session.started"`). */
  eventName: string;

  /** VS Code command ID (e.g. `"witness.startSession"`). */
  commandId: string;

  /**
   * Active session ID, or `null` / `undefined` if none.
   * Treated as `null` when absent.
   */
  sessionId?: string | null;

  /**
   * Workspace-relative paths of artifacts written.
   * Must be relative paths using forward slashes (use {@link toRelativeWitnessPath}
   * to convert from URIs). Defaults to empty array.
   */
  artifactPaths?: string[];

  /** Terminal status of the command execution. */
  status: WitnessTelemetryStatus;

  /**
   * Elapsed milliseconds (e.g. from {@link createCommandTimer}).
   * Treated as `null` when absent.
   */
  durationMs?: number | null;

  /**
   * Command-specific metadata. Non-serializable values are dropped silently.
   * Defaults to empty object.
   */
  attributes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/**
 * Extension version read from package.json at module load time.
 * Cached here so that `emitWitnessEvent` does not incur a per-call file read.
 */
const EXTENSION_VERSION: string = packageJson.version;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a lightweight command timer.
 *
 * Returns a function that, when called, produces the number of whole
 * milliseconds elapsed since `createCommandTimer()` was called.
 *
 * Intended usage pattern:
 *
 * ```typescript
 * const elapsed = createCommandTimer();
 * // ... perform command work ...
 * await emitWitnessEvent({ ..., durationMs: elapsed(), ... });
 * ```
 *
 * @returns A zero-argument function that returns `duration_ms` as a number.
 */
export function createCommandTimer(): () => number {
  const start = Date.now();
  return (): number => Date.now() - start;
}

/**
 * Converts an absolute artifact URI to a workspace-relative logical path
 * string suitable for inclusion in telemetry event `artifact_paths`.
 *
 * Path separators are normalized to forward slashes for cross-platform
 * consistency in the JSONL output.
 *
 * If `artifactUri` is outside the workspace root, only the filename (basename)
 * is returned to avoid leaking directory structure outside the workspace.
 *
 * @param workspaceRoot - URI of the workspace root folder.
 * @param artifactUri   - URI of the artifact to convert.
 * @returns A workspace-relative path string using forward slashes.
 */
export function toRelativeWitnessPath(
  workspaceRoot: vscode.Uri,
  artifactUri: vscode.Uri
): string {
  const rel = path.relative(workspaceRoot.fsPath, artifactUri.fsPath);

  // If the artifact is outside the workspace root, `path.relative` produces a
  // path starting with `..`. In that case, fall back to the filename only.
  if (rel.startsWith('..')) {
    return path.basename(artifactUri.fsPath);
  }

  // Normalize OS-native path separators to forward slashes for consistency.
  return rel.split(path.sep).join('/');
}

/**
 * Emits a single structured event by appending a JSON line to
 * `.witness/telemetry/otel/events.jsonl`.
 *
 * **Fire-and-forget**: this function never throws. All I/O errors are caught
 * and silently discarded. A telemetry write failure does not affect the
 * caller's control flow in any way.
 *
 * If no workspace root is provided (i.e. no folder is open), the function
 * returns immediately without writing anything.
 *
 * @param params - Structured event parameters. See {@link EmitWitnessEventParams}.
 */
export async function emitWitnessEvent(params: EmitWitnessEventParams): Promise<void> {
  try {
    await writeEvent(params);
  } catch {
    // Intentionally swallowed. Telemetry failures are never surfaced to the
    // user and never affect command execution.
  }
}

// ---------------------------------------------------------------------------
// Internal implementation
// ---------------------------------------------------------------------------

/**
 * Core event-writing logic. May throw; the public {@link emitWitnessEvent}
 * catches all errors.
 */
async function writeEvent(params: EmitWitnessEventParams): Promise<void> {
  const {
    workspaceRoot,
    eventName,
    commandId,
    sessionId = null,
    artifactPaths = [],
    status,
    durationMs = null,
    attributes = {},
  } = params;

  // Nothing to write if there is no open workspace.
  if (workspaceRoot === undefined) {
    return;
  }

  const event: WitnessTelemetryEvent = {
    timestamp: new Date().toISOString(),
    event_name: eventName,
    extension_version: EXTENSION_VERSION,
    workspace_root_hash: hashPath(workspaceRoot.fsPath),
    session_id: sessionId ?? null,
    command_id: commandId,
    artifact_paths: sanitizeArtifactPaths(artifactPaths),
    status,
    duration_ms: durationMs ?? null,
    attributes: sanitizeAttributes(attributes),
  };

  // Compute the path to the JSONL file.
  //
  // The writer constructs the witness root from workspaceRoot directly rather
  // than importing getWitnessRoot() to keep this module self-contained and
  // to preserve the fire-and-forget contract without depending on other
  // modules that may throw.
  const witnessRoot = vscode.Uri.joinPath(workspaceRoot, '.witness');
  const otelDir = vscode.Uri.joinPath(witnessRoot, 'telemetry', OTEL_SUBDIR);
  const eventsUri = vscode.Uri.joinPath(otelDir, EVENTS_FILENAME);

  // Ensure the otel/ directory exists before writing.
  await ensureDirSilent(otelDir);

  // Append the serialized event as a single JSON line.
  await appendJsonLine(eventsUri, event);
}

/**
 * Computes `"sha256:<hex>"` for `fsPath`.
 *
 * This is a one-way transformation. The raw filesystem path is never stored.
 */
function hashPath(fsPath: string): string {
  const hex = createHash('sha256').update(fsPath, 'utf8').digest('hex');
  return `sha256:${hex}`;
}

/**
 * Creates a directory at `uri` and its parents if they do not exist.
 *
 * Errors (including "already exists") are silently swallowed, consistent with
 * the fire-and-forget contract of the telemetry writer.
 */
async function ensureDirSilent(uri: vscode.Uri): Promise<void> {
  try {
    // createDirectory is recursive and idempotent on most VS Code FS providers.
    await vscode.workspace.fs.createDirectory(uri);
  } catch {
    // Acceptable: directory may already exist, or the provider may not support
    // createDirectory in the current context.
  }
}

/**
 * Serializes `event` to a single JSON line and appends it (with a trailing
 * newline) to `uri`.
 *
 * If `uri` does not exist it is created. If the existing file content does not
 * end with a newline, one is inserted before the new line as a defensive
 * measure.
 *
 * Note: v2.1 uses a read-then-write approach because
 * `vscode.workspace.fs` does not expose an append-mode write. File locking
 * and rotation are deferred to a future release.
 */
async function appendJsonLine(
  uri: vscode.Uri,
  event: WitnessTelemetryEvent
): Promise<void> {
  // Read existing content, defaulting to empty string if file does not exist.
  let existing = '';
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    existing = new TextDecoder().decode(bytes);
  } catch {
    // File does not exist yet — begin with empty content.
  }

  // Defensive: ensure existing content ends with a newline before appending.
  if (existing.length > 0 && !existing.endsWith('\n')) {
    existing += '\n';
  }

  const line = JSON.stringify(event);
  const updated = existing + line + '\n';

  await vscode.workspace.fs.writeFile(
    uri,
    new TextEncoder().encode(updated)
  );
}

/**
 * Validates and normalizes `paths` to workspace-relative forward-slash strings.
 *
 * Absolute paths (OS-native or POSIX) are reduced to their filename only, as a
 * safety guard against accidentally writing filesystem layout information to the
 * event log.
 */
function sanitizeArtifactPaths(paths: string[]): string[] {
  return paths.map(p => {
    // Guard: absolute paths must not be stored. Reduce to basename only.
    if (path.isAbsolute(p) || p.startsWith('/')) {
      return path.basename(p);
    }
    // Normalize OS-native separators to forward slashes.
    return p.split(path.sep).join('/');
  });
}

/**
 * Sanitizes `attributes` by round-tripping through JSON serialization.
 *
 * Non-serializable values (functions, `undefined`, symbols, circular
 * references) are dropped by `JSON.stringify` / `JSON.parse`. If the entire
 * object fails to serialize, an empty object is returned.
 *
 * This is a structural safety check only. Callers are responsible for ensuring
 * attributes do not contain privacy-sensitive data (file contents, prompt
 * text, absolute paths, etc.).
 */
function sanitizeAttributes(
  attributes: Record<string, unknown>
): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(attributes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}
