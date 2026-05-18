import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Path of the current-session pointer file relative to `.witness/`. */
const CURRENT_SESSION_FILE = '.current-session';

/**
 * Returns the URI of the `.witness/.current-session` file.
 */
function currentSessionUri(witnessRoot: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(witnessRoot, CURRENT_SESSION_FILE);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads the active session ID from `.witness/.current-session`.
 *
 * @returns The session ID string (e.g. `"2026-05-12-001"`) or `undefined` if
 *   the file does not exist (no active session).
 */
export async function getCurrentSessionId(
  witnessRoot: vscode.Uri
): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(currentSessionUri(witnessRoot));
    const content = decoder.decode(bytes).trim();
    return content.length > 0 ? content : undefined;
  } catch {
    // File not found — no active session.
    return undefined;
  }
}

/**
 * Writes `sessionId` into `.witness/.current-session`, replacing any previous
 * value.
 *
 * @param witnessRoot - URI of the `.witness/` directory.
 * @param sessionId   - The session ID to set as current.
 */
export async function setCurrentSessionId(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<void> {
  await vscode.workspace.fs.writeFile(
    currentSessionUri(witnessRoot),
    encoder.encode(sessionId)
  );
}

/**
 * Removes the `.witness/.current-session` file, indicating no active session.
 * If the file does not exist, this is a no-op.
 *
 * @param witnessRoot - URI of the `.witness/` directory.
 */
export async function clearCurrentSessionId(
  witnessRoot: vscode.Uri
): Promise<void> {
  try {
    await vscode.workspace.fs.delete(currentSessionUri(witnessRoot));
  } catch {
    // File already absent — nothing to do.
  }
}

/**
 * Generates the next available session ID for `today` by scanning
 * `.witness/sessions/` for existing files that match the date prefix.
 *
 * The ID format is `YYYY-MM-DD-NNN` where NNN is a three-digit, zero-padded
 * ordinal starting at `001`. The local date is used (NOT UTC).
 *
 * @param witnessRoot - URI of the `.witness/` directory.
 * @param today       - The date to generate an ID for (use `new Date()`).
 * @returns A session ID string such as `"2026-05-12-001"`.
 */
export async function generateNewSessionId(
  witnessRoot: vscode.Uri,
  today: Date
): Promise<string> {
  // Format local date components.
  const yyyy = String(today.getFullYear());
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const datePrefix = `${yyyy}-${mm}-${dd}`;

  // Regex to match existing session files for today: YYYY-MM-DD-NNN.md
  const existingPattern = new RegExp(`^${datePrefix}-(\\d{3})\\.md$`);

  let maxOrdinal = 0;

  try {
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    const entries = await vscode.workspace.fs.readDirectory(sessionsDir);

    for (const [name] of entries) {
      const match = existingPattern.exec(name);
      if (match) {
        const ordinal = parseInt(match[1], 10);
        if (ordinal > maxOrdinal) {
          maxOrdinal = ordinal;
        }
      }
    }
  } catch {
    // Sessions directory does not exist or cannot be read — treat as empty.
  }

  const nextOrdinal = maxOrdinal + 1;
  const nnn = String(nextOrdinal).padStart(3, '0');
  return `${datePrefix}-${nnn}`;
}
