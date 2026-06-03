// ---------------------------------------------------------------------------
// updateProjectMemoryWithAgent.ts — Witness: Update Project Memory with Agent (v6.4)
// ---------------------------------------------------------------------------
//
// Detects the current Witness maintenance need and generates a strict,
// copy-ready artifact-maintenance prompt for the developer to paste into
// their active coding agent.
//
// Design invariants:
//   - Does NOT call any LLM.
//   - Does NOT write to `.witness/` or any source file.
//   - Does NOT inject context into any coding agent automatically.
//   - Does NOT implement artifact validation (deferred to v6.5).
//   - Orchestration only: compute need → generate prompt → present → telemetry.
//   - No webview. No direct provider API. No API key handling.
//   - No raw prompt text, file content, or evidence strings in telemetry.
//
// Acceptance criterion:
//   "Witness detected what memory maintenance is needed and generated a safe
//    prompt for my coding agent."
//
// v6.4: Initial implementation using Route A+ (copy-ready prompt workflow).
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { computeWorkspaceStatus } from '../core/workspaceStatus';
import {
  computeMaintenanceNeed,
  MaintenanceNeedKind,
} from '../core/maintenanceTriggerEngine';
import {
  generateArtifactMaintenancePrompt,
  ArtifactMaintenancePromptKind,
} from '../core/artifactMaintenancePromptGenerator';
import { presentPrompt } from '../core/promptPresenter';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';

// ---------------------------------------------------------------------------
// Kind mapping
// ---------------------------------------------------------------------------

/**
 * Maps a `MaintenanceNeedKind` to the corresponding `ArtifactMaintenancePromptKind`.
 * Returns `null` when no prompt should be generated (kind is "none").
 */
function toPromptKind(
  kind: MaintenanceNeedKind
): ArtifactMaintenancePromptKind | null {
  switch (kind) {
    case 'update-current-state':   return 'update-current-state';
    case 'create-checkpoint':      return 'create-checkpoint';
    case 'prepare-handover':       return 'prepare-handover';
    case 'review-subagent-artifacts': return 'review-subagent-artifacts';
    case 'resume-with-witness':    return 'resume-with-witness';
    case 'none':                   return null;
  }
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

/**
 * Implementation of the `Witness: Update Project Memory with Agent` command (v6.4).
 *
 * Computes the most relevant Witness maintenance need from the current workspace
 * state, generates a strict artifact-only prompt for the developer's active
 * coding agent, and opens it in a copy-ready unsaved markdown tab.
 *
 * The developer pastes the prompt into their coding agent. The agent drafts
 * the `.witness/` artifact update. The developer reviews and approves.
 * Witness validates (v6.5).
 *
 * Emits telemetry event `witness.artifact_maintenance.prompt_generated`.
 */
export async function updateProjectMemoryWithAgent(
  _context: vscode.ExtensionContext
): Promise<void> {
  const elapsed = createCommandTimer();

  // Telemetry state — accumulated as the command progresses.
  let maintenanceKind: string = 'unknown';
  let severity: string = 'info';
  let evidenceCount: number = 0;
  let activeSessionPresent: boolean = false;
  let promptOpened: boolean = false;
  let copiedToClipboard: boolean = false;
  let completed: boolean = false;
  let cancelledAt: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Require an open workspace folder.
    // -------------------------------------------------------------------------

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      cancelledAt = 'no-workspace';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.artifact_maintenance.prompt_generated',
        commandId: 'witness.updateProjectMemoryWithAgent',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          maintenance_kind: maintenanceKind,
          severity,
          evidence_count: evidenceCount,
          active_session_present: activeSessionPresent,
          prompt_opened: promptOpened,
          copied_to_clipboard: copiedToClipboard,
          completed,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 2. Require .witness/ to exist.
    //    The trigger engine also detects this (Rule 1), but we guard here so
    //    we can show a clear error before attempting computeWorkspaceStatus,
    //    which may produce less readable output on an uninitialised workspace.
    // -------------------------------------------------------------------------

    const witnessRoot = getWitnessRoot(workspaceRoot);
    let witnessExists = false;
    try {
      await vscode.workspace.fs.stat(witnessRoot);
      witnessExists = true;
    } catch {
      // .witness/ not found — will be reflected in the status below.
    }

    if (!witnessExists) {
      vscode.window.showErrorMessage(
        'Witness: Enable Witness before updating project memory.'
      );
      cancelledAt = 'no-witness-dir';
      maintenanceKind = 'none';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.artifact_maintenance.prompt_generated',
        commandId: 'witness.updateProjectMemoryWithAgent',
        sessionId: null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          maintenance_kind: maintenanceKind,
          severity,
          evidence_count: evidenceCount,
          active_session_present: activeSessionPresent,
          prompt_opened: promptOpened,
          copied_to_clipboard: copiedToClipboard,
          completed,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 3. Compute workspace status.
    // -------------------------------------------------------------------------

    const status = await computeWorkspaceStatus(workspaceRoot);
    activeSessionPresent = status.activeSessionId !== null;

    // -------------------------------------------------------------------------
    // 4. Compute maintenance need.
    //    dirtyWorkspace / changedFileCount / latestCheckpointAgeMinutes are
    //    omitted in v6.4 — git observation is deferred to a later pass.
    // -------------------------------------------------------------------------

    const need = computeMaintenanceNeed({ status });
    maintenanceKind = need.kind;
    severity = need.severity;
    evidenceCount = need.evidence.length;

    // -------------------------------------------------------------------------
    // 5a. Handle "none" — Witness not enabled (Rule 1 reached despite guard).
    //     This path is reachable if hasWitness flipped between the guard and
    //     the status computation, or on a partial init state.
    // -------------------------------------------------------------------------

    if (need.kind === 'none' && need.recommendedCommandId === 'witness.enableProject') {
      vscode.window.showErrorMessage(
        'Witness: Enable Witness before updating project memory.'
      );
      cancelledAt = 'witness-not-enabled';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.artifact_maintenance.prompt_generated',
        commandId: 'witness.updateProjectMemoryWithAgent',
        sessionId: status.activeSessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          maintenance_kind: maintenanceKind,
          severity,
          evidence_count: evidenceCount,
          active_session_present: activeSessionPresent,
          prompt_opened: promptOpened,
          copied_to_clipboard: copiedToClipboard,
          completed,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 5b. Handle "none" — project memory is up to date.
    // -------------------------------------------------------------------------

    if (need.kind === 'none') {
      vscode.window.showInformationMessage('Witness: Project memory is up to date.');
      completed = true;
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.artifact_maintenance.prompt_generated',
        commandId: 'witness.updateProjectMemoryWithAgent',
        sessionId: status.activeSessionId ?? null,
        status: 'success',
        durationMs: elapsed(),
        attributes: {
          maintenance_kind: maintenanceKind,
          severity,
          evidence_count: evidenceCount,
          active_session_present: activeSessionPresent,
          prompt_opened: promptOpened,
          copied_to_clipboard: copiedToClipboard,
          completed,
          cancelled_at: null,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 6. Map maintenance need to prompt kind.
    //    At this point need.kind is guaranteed to be non-"none".
    // -------------------------------------------------------------------------

    const promptKind = toPromptKind(need.kind);
    if (promptKind === null) {
      // Should not be reachable after the "none" guard above, but be explicit.
      vscode.window.showInformationMessage('Witness: Project memory is up to date.');
      completed = true;
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.artifact_maintenance.prompt_generated',
        commandId: 'witness.updateProjectMemoryWithAgent',
        sessionId: status.activeSessionId ?? null,
        status: 'success',
        durationMs: elapsed(),
        attributes: {
          maintenance_kind: maintenanceKind,
          severity,
          evidence_count: evidenceCount,
          active_session_present: activeSessionPresent,
          prompt_opened: promptOpened,
          copied_to_clipboard: copiedToClipboard,
          completed,
          cancelled_at: null,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 7. Generate the artifact-maintenance prompt.
    // -------------------------------------------------------------------------

    const generated = generateArtifactMaintenancePrompt({
      kind: promptKind,
      maintenanceTitle: need.title,
      maintenanceReason: need.reason,
      evidence: need.evidence,
      activeSessionId: status.activeSessionId,
      taskGoal: null, // task goal is not stored on WitnessWorkspaceStatus in v6.4
    });

    // -------------------------------------------------------------------------
    // 8. Open prompt in an unsaved markdown tab and offer Copy Prompt action.
    // -------------------------------------------------------------------------

    const presentResult = await presentPrompt(
      generated.prompt,
      'Witness: Prompt ready. Paste this into your coding agent. After it updates `.witness/`, run `Witness: Check Memory Update`.'
    );
    promptOpened = presentResult.promptOpened;
    copiedToClipboard = presentResult.copiedToClipboard;

    if (!promptOpened) {
      // presentPrompt is non-fatal; if the tab failed to open, record this but
      // do not show an additional error — presentPrompt silently swallows the
      // failure to avoid cascading UI noise.
      cancelledAt = 'prompt-presentation';
      await emitWitnessEvent({
        workspaceRoot,
        eventName: 'witness.artifact_maintenance.prompt_generated',
        commandId: 'witness.updateProjectMemoryWithAgent',
        sessionId: status.activeSessionId ?? null,
        status: 'cancelled',
        durationMs: elapsed(),
        attributes: {
          maintenance_kind: maintenanceKind,
          severity,
          evidence_count: evidenceCount,
          active_session_present: activeSessionPresent,
          prompt_opened: promptOpened,
          copied_to_clipboard: copiedToClipboard,
          completed,
          cancelled_at: cancelledAt,
        },
      });
      return;
    }

    // -------------------------------------------------------------------------
    // 9. Success.
    // -------------------------------------------------------------------------

    completed = true;
    await emitWitnessEvent({
      workspaceRoot,
      eventName: 'witness.artifact_maintenance.prompt_generated',
      commandId: 'witness.updateProjectMemoryWithAgent',
      sessionId: status.activeSessionId ?? null,
      status: 'success',
      durationMs: elapsed(),
      attributes: {
        maintenance_kind: maintenanceKind,
        severity,
        evidence_count: evidenceCount,
        active_session_present: activeSessionPresent,
        prompt_opened: promptOpened,
        copied_to_clipboard: copiedToClipboard,
        completed,
        cancelled_at: null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await emitWitnessEvent({
      workspaceRoot: getWorkspaceRoot(),
      eventName: 'witness.artifact_maintenance.prompt_generated',
      commandId: 'witness.updateProjectMemoryWithAgent',
      sessionId: null,
      status: 'error',
      durationMs: elapsed(),
      attributes: {
        maintenance_kind: maintenanceKind,
        severity,
        evidence_count: evidenceCount,
        active_session_present: activeSessionPresent,
        prompt_opened: promptOpened,
        copied_to_clipboard: copiedToClipboard,
        completed: false,
        cancelled_at: cancelledAt ?? 'unhandled-error',
      },
    });
    vscode.window.showErrorMessage(
      `Witness: Update Project Memory with Agent failed — ${message}`
    );
  }
}
