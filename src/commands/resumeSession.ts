// ---------------------------------------------------------------------------
// resumeSession.ts — Witness: Resume Session command (v3.5).
// ---------------------------------------------------------------------------
//
// Guides the developer through selecting a context packet and choosing a
// resumption action:
//   1. Scan .witness/sessions/ for context packet files
//   2. Present QuickPick of packets (most recent first)
//   3. Open selected packet in editor
//   4. Developer-chosen resumption action
//
// Design invariants:
//   - Does not inject context into any coding agent automatically.
//   - Does not switch sessions unless developer explicitly selects Start New Session.
//   - Uses vscode.workspace.fs exclusively (no node:fs).
//   - One workflow-level telemetry event emitted on exit (complete or cancelled).
//   - No LLM calls. No raw artifact content in telemetry.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';
import { refreshWitnessStatusBar } from '../core/statusBar';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Pattern matching session-level context packet files. */
const CONTEXT_PACKET_RE = /-context-packet-\d+\.md$/;

// ---------------------------------------------------------------------------
// File scanning
// ---------------------------------------------------------------------------

interface ContextPacketEntry {
  name: string;
  uri: vscode.Uri;
  mtime: number;
}

/**
 * Scans `.witness/sessions/` for files matching the context packet pattern and
 * returns them sorted by modification time descending (most recent first).
 *
 * Returns an empty array if the directory cannot be read or no matching files
 * exist.
 */
async function findContextPackets(
  witnessRoot: vscode.Uri
): Promise<ContextPacketEntry[]> {
  const sessionsDir = vscode.Uri.joinPath(witnessRoot, 'sessions');
  let entries: [string, vscode.FileType][] = [];

  try {
    entries = await vscode.workspace.fs.readDirectory(sessionsDir);
  } catch {
    return [];
  }

  const packets: ContextPacketEntry[] = [];

  for (const [name, fileType] of entries) {
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    if (!CONTEXT_PACKET_RE.test(name)) {
      continue;
    }

    const uri = vscode.Uri.joinPath(sessionsDir, name);
    let mtime = 0;
    try {
      const st = await vscode.workspace.fs.stat(uri);
      mtime = st.mtime;
    } catch {
      // Stat failure: include the file but sort it to the end.
    }

    packets.push({ name, uri, mtime });
  }

  // Sort descending by mtime (most recent first).
  packets.sort((a, b) => b.mtime - a.mtime);
  return packets;
}

// ---------------------------------------------------------------------------
// Resumption action QuickPick items
// ---------------------------------------------------------------------------

interface ResumptionItem extends vscode.QuickPickItem {
  commandId: string | null;
  stepKey: string;
}

const RESUMPTION_ITEMS: ResumptionItem[] = [
  {
    label: 'Create Resume Probe',
    description: 'Create a resume quality probe for this context packet',
    commandId: 'witness.createResumeProbe',
    stepKey: 'create-resume-probe',
  },
  {
    label: 'Start New Session',
    description: 'Begin a new tracked session for this workspace',
    commandId: 'witness.startSession',
    stepKey: 'start-new-session',
  },
  {
    label: 'Show Workspace Status',
    description: 'View the full continuity status report',
    commandId: 'witness.showWorkspaceStatus',
    stepKey: 'show-status',
  },
  {
    label: 'Done',
    description: 'Context packet reviewed — no further action',
    commandId: null,
    stepKey: 'done',
  },
];

// ---------------------------------------------------------------------------
// QuickPick item for packet selection
// ---------------------------------------------------------------------------

interface PacketQuickPickItem extends vscode.QuickPickItem {
  entry: ContextPacketEntry;
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Resume Session` command.
 *
 * Presents available context packets, opens the selected one in the editor,
 * then offers a developer-chosen resumption action. Does not auto-inject
 * context or switch sessions without explicit user selection.
 */
export async function resumeSession(
  context: vscode.ExtensionContext
): Promise<void> {
  void context;
  const elapsed = createCommandTimer();
  const workspaceRoot = getWorkspaceRoot();

  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Witness: Open a folder first.');
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.session_resumed',
      commandId: 'witness.resumeSession',
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'no-workspace',
        selected_context_packet: false,
      },
    });
    return;
  }

  const witnessRoot = getWitnessRoot(workspaceRoot);

  // -------------------------------------------------------------------------
  // Step 1 — Scan for context packets
  // -------------------------------------------------------------------------

  const packets = await findContextPackets(witnessRoot);

  if (packets.length === 0) {
    vscode.window.showInformationMessage(
      'Witness: No context packets found. ' +
      'Use Witness: Create Context Packet before resuming a session.'
    );
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.session_resumed',
      commandId: 'witness.resumeSession',
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'no-context-packets',
        selected_context_packet: false,
      },
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Step 2 — Context packet selection QuickPick
  // -------------------------------------------------------------------------

  const packetItems: PacketQuickPickItem[] = packets.map(entry => {
    const ageMs = entry.mtime > 0 ? Date.now() - entry.mtime : null;
    const ageLabel =
      ageMs === null
        ? ''
        : ageMs < 60_000
          ? ' (less than 1 min ago)'
          : ageMs < 3_600_000
            ? ` (${Math.floor(ageMs / 60_000)} min ago)`
            : ` (${Math.floor(ageMs / 3_600_000)}h ago)`;

    return {
      label: entry.name,
      description: `Modified${ageLabel}`,
      entry,
    };
  });

  const selectedPacket = await vscode.window.showQuickPick(packetItems, {
    title: 'Witness: Resume Session — Select Context Packet',
    placeHolder: 'Select a context packet to review (most recent first)',
  });

  if (!selectedPacket) {
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.session_resumed',
      commandId: 'witness.resumeSession',
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'context-packet-selection',
        selected_context_packet: false,
      },
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Step 3 — Open selected context packet in editor
  // -------------------------------------------------------------------------

  try {
    const doc = await vscode.workspace.openTextDocument(selectedPacket.entry.uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    // If the file cannot be opened, surface an error but continue to the
    // resumption action QuickPick so the developer can still act.
    vscode.window.showWarningMessage(
      `Witness: Could not open context packet "${selectedPacket.entry.name}". ` +
      'The file may have been moved or deleted.'
    );
  }

  // -------------------------------------------------------------------------
  // Step 4 — Resumption action QuickPick
  // -------------------------------------------------------------------------

  const resumptionPick = await vscode.window.showQuickPick(RESUMPTION_ITEMS, {
    title: 'Witness: Resume Session — Choose Next Action',
    placeHolder: 'Select how to continue',
  });

  if (!resumptionPick) {
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.workflow.session_resumed',
      commandId: 'witness.resumeSession',
      status: 'cancelled',
      durationMs: elapsed(),
      attributes: {
        completed: false,
        cancelled_at: 'resumption-action-selection',
        selected_context_packet: true,
      },
    });
    return;
  }

  if (resumptionPick.commandId !== null) {
    try {
      await vscode.commands.executeCommand(resumptionPick.commandId);
    } catch {
      // Inner command failure is non-fatal to the workflow.
    }
  }

  // -------------------------------------------------------------------------
  // Completion
  // -------------------------------------------------------------------------

  await emitWitnessEvent({
    workspaceRoot,
    eventName: 'witness.workflow.session_resumed',
    commandId: 'witness.resumeSession',
    status: 'success',
    durationMs: elapsed(),
    attributes: {
      completed: true,
      cancelled_at: null,
      selected_context_packet: true,
      selected_next_step: resumptionPick.stepKey,
    },
  });

  // Refresh the status bar to reflect updated workspace state.
  await refreshWitnessStatusBar();
}
