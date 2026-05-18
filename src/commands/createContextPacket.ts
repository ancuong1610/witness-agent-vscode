import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { readFile } from '../core/artifactWriter';
import { loadTemplate } from '../core/templates';
import { getCurrentSessionId } from '../core/sessionRegistry';
import {
  createCommandTimer,
  emitWitnessEvent,
  toRelativeWitnessPath,
} from '../core/telemetryWriter';
import { formatLocalTimestamp } from '../core/time';

// ---------------------------------------------------------------------------
// createContextPacket.ts — session-level context packet command
//
// Produces `.witness/sessions/<session-id>-context-packet-NNN.md` containing
// the minimum reliable context a fresh primary coding-agent session needs.
//
// IMPORTANT: This is NOT the subagent context packet command
// (witness.createSubagentContextPacket). Those packets live in
// `.witness/subagents/subagent-NNN/context-packet.md`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Module-level encoder/decoder
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Substitution helpers
// ---------------------------------------------------------------------------

function replaceAll(content: string, placeholder: string, value: string): string {
  return content.split(placeholder).join(value);
}

// ---------------------------------------------------------------------------
// Mandatory marker detection
// ---------------------------------------------------------------------------

/**
 * Counts the number of obvious mandatory markers / unfilled placeholders in
 * `text`. This is a simple string search — it does not parse markdown.
 *
 * Markers counted:
 *   `{{`        — template placeholder brace
 *   `TODO`      — developer TODO marker
 *   `MANDATORY` — explicit mandatory field marker
 *   `[MISSING`  — gap-fill bracket marker
 *   `<fill`     — HTML-style fill-in prompt
 */
function countMandatoryMarkers(text: string): number {
  const patterns = ['{{', 'TODO', 'MANDATORY', '[MISSING', '<fill'];
  let count = 0;
  for (const pattern of patterns) {
    let pos = 0;
    while ((pos = text.indexOf(pattern, pos)) !== -1) {
      count++;
      pos += pattern.length;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Session directory scanning helpers
// ---------------------------------------------------------------------------

/**
 * Reads `.witness/sessions/` and returns all entries, or an empty array if the
 * directory does not exist or cannot be read.
 */
async function readSessionsDir(
  witnessRoot: vscode.Uri
): Promise<[string, vscode.FileType][]> {
  const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
  try {
    return await vscode.workspace.fs.readDirectory(sessionsDir);
  } catch {
    return [];
  }
}

/**
 * Escapes a string for safe use inside a `RegExp` constructor.
 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scans the given directory entries for files matching `pattern` and returns
 * the filename with the highest captured ordinal (group 1), or undefined.
 */
function pickHighestOrdinal(
  entries: [string, vscode.FileType][],
  pattern: RegExp
): string | undefined {
  let maxOrdinal = -1;
  let bestFile: string | undefined;
  for (const [name] of entries) {
    const match = pattern.exec(name);
    if (match) {
      const ordinal = parseInt(match[1], 10);
      if (ordinal > maxOrdinal) {
        maxOrdinal = ordinal;
        bestFile = name;
      }
    }
  }
  return bestFile;
}

/**
 * Computes the next context-packet ordinal for the active session by scanning
 * `.witness/sessions/` for files matching `<session-id>-context-packet-NNN.md`.
 * Returns 1 if none exist.
 */
async function nextContextPacketOrdinal(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<number> {
  const entries = await readSessionsDir(witnessRoot);
  const escaped = escapeRegExp(sessionId);
  const pattern = new RegExp(`^${escaped}-context-packet-(\\d{3})\\.md$`);
  let maxOrdinal = 0;
  for (const [name] of entries) {
    const match = pattern.exec(name);
    if (match) {
      const ordinal = parseInt(match[1], 10);
      if (ordinal > maxOrdinal) {
        maxOrdinal = ordinal;
      }
    }
  }
  return maxOrdinal + 1;
}

// ---------------------------------------------------------------------------
// ADR reference extraction from handover text
// ---------------------------------------------------------------------------

/**
 * Scans the handover text for markdown links pointing to `../decisions/` and
 * returns the unique set of referenced ADR filenames (without the leading
 * `../decisions/` path prefix). Returns an empty array if none are found.
 *
 * This is a best-effort extraction — it only finds links in the standard
 * markdown link syntax `[label](../decisions/<filename>.md)`.
 */
function extractAdrReferencesFromHandover(handoverText: string): string[] {
  const pattern = /\(\.\.\/decisions\/([^)]+\.md)\)/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(handoverText)) !== null) {
    found.add(match[1]);
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Subagent reference extraction (v2 ledger directories + v1 flat files)
// ---------------------------------------------------------------------------

/**
 * Scans `.witness/subagents/` for entries whose `Parent Session` field matches
 * the given session ID. Checks both v1 flat files and v2 ledger directories
 * (reads `contract.md` inside each directory as the primary source of the
 * session reference).
 *
 * Returns relative reference strings suitable for inclusion in the packet.
 * Best-effort — any individual read failure is silently skipped.
 */
async function gatherSubagentReferences(
  witnessRoot: vscode.Uri,
  sessionId: string
): Promise<string[]> {
  const subagentsDir = vscode.Uri.joinPath(witnessRoot, 'subagents');
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(subagentsDir);
  } catch {
    return [];
  }

  const refs: string[] = [];

  for (const [name, type] of entries) {
    if (type === vscode.FileType.File && name.endsWith('.md')) {
      // v1 flat file — read directly.
      const uri = vscode.Uri.joinPath(subagentsDir, name);
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = decoder.decode(bytes);
        if (text.includes(sessionId)) {
          refs.push(`.witness/subagents/${name}`);
        }
      } catch {
        // Silently skip unreadable files.
      }
    } else if (type === vscode.FileType.Directory) {
      // v2 ledger directory — check contract.md for the session reference.
      const contractUri = vscode.Uri.joinPath(subagentsDir, name, 'contract.md');
      try {
        const bytes = await vscode.workspace.fs.readFile(contractUri);
        const text = decoder.decode(bytes);
        if (text.includes(sessionId)) {
          refs.push(`.witness/subagents/${name}/`);
        }
      } catch {
        // No contract.md or unreadable — skip.
      }
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Create Context Packet` command.
 *
 * Assembles the minimum reliable context for a fresh primary coding-agent
 * session into `.witness/sessions/<session-id>-context-packet-NNN.md`.
 *
 * Requires:
 *   - An active session (`.witness/.current-session`)
 *   - `.witness/current-state.md`
 *   - `.witness/handovers/latest.md`
 *
 * Optional references (paths only, no inlined content):
 *   - Most recent risk assessment for the active session
 *   - Most recent workspace observation for the active session
 *   - ADRs referenced in latest.md
 *   - Subagent ledgers or reports linked to the active session
 */
export async function createContextPacket(
  context: vscode.ExtensionContext
): Promise<void> {
  const elapsed = createCommandTimer();
  try {
    // 1. Require an open workspace folder.
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      return;
    }

    // 2. Require .witness/ to exist.
    const witnessRoot = getWitnessRoot(workspaceRoot);
    try {
      await vscode.workspace.fs.stat(witnessRoot);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Run "Witness: Initialize Project" first.'
      );
      return;
    }

    // 3. Require an active session.
    const sessionId = await getCurrentSessionId(witnessRoot);
    if (sessionId === undefined) {
      vscode.window.showErrorMessage(
        'Witness: No active session. Run "Witness: Start Session" first.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.context_packet.created',
        commandId: 'witness.createContextPacket',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: { required_sources_available: false },
      });
      return;
    }

    // 4. Require .witness/current-state.md.
    const currentStateUri = vscode.Uri.joinPath(witnessRoot, 'current-state.md');
    let currentStateContent: string;
    try {
      currentStateContent = await readFile(currentStateUri);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Create Context Packet failed — .witness/current-state.md is missing or unreadable. ' +
        'Run "Witness: Initialize Project" or create the file manually.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.context_packet.created',
        commandId: 'witness.createContextPacket',
        sessionId,
        status: 'error',
        durationMs: elapsed(),
        attributes: {
          required_sources_available: false,
          had_risk_assessment: false,
          had_workspace_observation: false,
        },
      });
      return;
    }

    // 5. Require .witness/handovers/latest.md.
    const latestHandoverUri = vscode.Uri.joinPath(witnessRoot, 'handovers', 'latest.md');
    let handoverContent: string;
    try {
      handoverContent = await readFile(latestHandoverUri);
    } catch {
      vscode.window.showErrorMessage(
        'Witness: Create Context Packet failed — .witness/handovers/latest.md is missing or unreadable. ' +
        'Run "Witness: Generate Handover" first.'
      );
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.context_packet.created',
        commandId: 'witness.createContextPacket',
        sessionId,
        status: 'error',
        durationMs: elapsed(),
        attributes: {
          required_sources_available: false,
          had_risk_assessment: false,
          had_workspace_observation: false,
        },
      });
      return;
    }

    // 6. Gather optional references (best-effort — failures are silent).
    const escaped = escapeRegExp(sessionId);
    const sessionsEntries = await readSessionsDir(witnessRoot);

    const riskPattern = new RegExp(`^${escaped}-risk-(\\d{3})\\.md$`);
    const observationPattern = new RegExp(`^${escaped}-observation-(\\d{3})\\.md$`);

    const latestRiskFile = pickHighestOrdinal(sessionsEntries, riskPattern);
    const latestObservationFile = pickHighestOrdinal(sessionsEntries, observationPattern);

    const hadRiskAssessment = latestRiskFile !== undefined;
    const hadWorkspaceObservation = latestObservationFile !== undefined;

    // ADRs referenced in handover (extracted from link syntax).
    const adrFilenames = extractAdrReferencesFromHandover(handoverContent);

    // Subagent references for this session.
    const subagentRefs = await gatherSubagentReferences(witnessRoot, sessionId);

    // 7. Compute next context-packet ordinal (scoped to active session).
    const ordinal = await nextContextPacketOrdinal(witnessRoot, sessionId);
    const nnn = String(ordinal).padStart(3, '0');
    const packetId = `${sessionId}-context-packet-${nnn}`;
    const packetFilename = `${packetId}.md`;

    // 8. Load the template and substitute all placeholders.

    let content = await loadTemplate(context, 'context-packet-template.md');
    const createdAt = formatLocalTimestamp();

    // Core identity placeholders.
    content = replaceAll(content, '{{PACKET_ID}}', packetId);
    content = replaceAll(content, '{{SESSION_ID}}', sessionId);
    content = replaceAll(content, '{{PACKET_ORDINAL}}', nnn);
    content = replaceAll(content, '{{CREATED_AT}}', createdAt);

    // Required sources — inline full contents.
    content = replaceAll(content, '{{CURRENT_STATE_CONTENT}}', currentStateContent);
    content = replaceAll(content, '{{HANDOVER_CONTENT}}', handoverContent);

    // Optional references — paths only, no inlined content.
    const riskRef = hadRiskAssessment
      ? `- \`.witness/sessions/${latestRiskFile}\``
      : '- (none — run `Witness: Assess Continuity Risk` to generate one)';
    content = replaceAll(content, '{{RISK_REFERENCE}}', riskRef);

    const observationRef = hadWorkspaceObservation
      ? `- \`.witness/sessions/${latestObservationFile}\``
      : '- (none — run `Witness: Observe Workspace` to generate one)';
    content = replaceAll(content, '{{OBSERVATION_REFERENCE}}', observationRef);

    const adrRef =
      adrFilenames.length > 0
        ? adrFilenames.map(f => `- \`.witness/decisions/${f}\``).join('\n')
        : '- (none referenced in handover)';
    content = replaceAll(content, '{{ADR_REFERENCES}}', adrRef);

    const subagentRef =
      subagentRefs.length > 0
        ? subagentRefs.map(r => `- \`${r}\``).join('\n')
        : '- (none linked to this session)';
    content = replaceAll(content, '{{SUBAGENT_REFERENCES}}', subagentRef);

    // 9. Count mandatory markers across inlined required-source content.
    const combinedSourceText = currentStateContent + '\n' + handoverContent;
    const mandatoryMarkerCount = countMandatoryMarkers(combinedSourceText);

    // 10. Write the context packet file.
    const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
    const packetUri = vscode.Uri.joinPath(sessionsDir, packetFilename);
    await vscode.workspace.fs.writeFile(packetUri, encoder.encode(content));

    // 11. Open in editor.
    const doc = await vscode.workspace.openTextDocument(packetUri);
    await vscode.window.showTextDocument(doc);

    // 12. Emit success telemetry (character counts and booleans only — no content).
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.context_packet.created',
      commandId: 'witness.createContextPacket',
      sessionId,
      artifactPaths: [toRelativeWitnessPath(workspaceRoot, packetUri)],
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        packet_ordinal: ordinal,
        current_state_char_count: currentStateContent.length,
        handover_char_count: handoverContent.length,
        had_risk_assessment: hadRiskAssessment,
        had_workspace_observation: hadWorkspaceObservation,
        linked_adr_count: adrFilenames.length,
        included_subagent_reference_count: subagentRefs.length,
        required_sources_available: true,
        mandatory_marker_count: mandatoryMarkerCount,
        developer_review_required: true,
      },
    });

    // 13. Warn if mandatory markers remain in the inlined sources.
    if (mandatoryMarkerCount > 0) {
      vscode.window.showWarningMessage(
        `Witness: Context packet created, but mandatory markers remain. Review before use.`
      );
    } else {
      vscode.window.showInformationMessage(
        `Witness: Context packet ${packetId} created.`
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.context_packet.created',
      commandId: 'witness.createContextPacket',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
    });
    vscode.window.showErrorMessage(
      `Witness: Create Context Packet failed — ${message}`
    );
  }
}
