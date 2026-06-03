// ---------------------------------------------------------------------------
// statusLabel.ts — pure status bar label mapping.
// ---------------------------------------------------------------------------
//
// Converts a WitnessWorkspaceStatus plus optional observed work evidence into
// the short status bar label. Kept separate from statusBar.ts so v9 label
// behavior can be checked without loading the VS Code UI module.
//
// ---------------------------------------------------------------------------

import { WitnessWorkspaceStatus } from './workspaceStatusTypes';
import {
  computeMaintenanceNeed,
  MaintenanceNeed,
} from './maintenanceTriggerEngine';

export interface StatusLabelOptions {
  /**
   * True when the caller has observed meaningful source-work evidence, such as
   * dirty non-.witness files. False means the caller checked and found none.
   * Undefined means the caller has no reliable source-work signal.
   */
  hasMeaningfulWorkEvidence?: boolean;
}

type MaintenanceNeedOverride = Pick<MaintenanceNeed, 'kind'> &
  Partial<Pick<MaintenanceNeed, 'severity'>>;

/**
 * Maps the current `WitnessWorkspaceStatus` to the status bar text label.
 *
 * Label priority:
 *   1. No workspace root        -> `Witness: No Workspace`
 *   2. activeSessionId is null  -> `Witness: Start`
 *   3. severity critical        -> `Witness: Attention`
 *   4. subagent review need     -> `Witness: Review Needed`
 *   5. checkpoint/handover need -> `Witness: Save Needed`
 *   6. current-state-only need  -> `Witness: Tracking` until work evidence exists
 *   7. severity warning         -> `Witness: Review Needed`
 *   8. all-clear active session -> `Witness: Tracking`
 *   9. info + id not all-clear  -> `Witness: Checkpoint`
 */
export function statusLabel(
  status: WitnessWorkspaceStatus | null,
  hasWorkspace: boolean,
  maintenanceNeedOverride?: MaintenanceNeedOverride,
  options: StatusLabelOptions = {}
): string {
  if (!hasWorkspace) {
    return 'Witness: No Workspace';
  }
  if (status === null) {
    return 'Witness: Status Error';
  }
  if (status.activeSessionId === null) {
    return 'Witness: Start';
  }

  const { severity, id } = status.suggestedAction;
  if (severity === 'critical') {
    return 'Witness: Attention';
  }

  try {
    const need = maintenanceNeedOverride ?? computeMaintenanceNeed({ status });
    if (need.kind === 'review-subagent-artifacts') {
      return 'Witness: Review Needed';
    }
    if (isStrongSaveMaintenanceNeed(need, options)) {
      return 'Witness: Save Needed';
    }
    if (need.kind === 'update-current-state') {
      return options.hasMeaningfulWorkEvidence === true
        ? 'Witness: Save Needed'
        : 'Witness: Tracking';
    }
  } catch {
    // Non-fatal: fall back to the legacy severity/id mapping.
  }

  if (severity === 'warning') {
    if (isCurrentStateOnlySuggestedAction(id)) {
      return options.hasMeaningfulWorkEvidence === true
        ? 'Witness: Save Needed'
        : 'Witness: Tracking';
    }
    return 'Witness: Review Needed';
  }

  // severity === 'info'
  if (id === 'all-clear') {
    return 'Witness: Tracking';
  }
  return 'Witness: Checkpoint';
}

function isStrongSaveMaintenanceNeed(
  need: MaintenanceNeedOverride,
  options: StatusLabelOptions
): boolean {
  if (need.kind === 'create-checkpoint') {
    return true;
  }
  if (need.kind !== 'prepare-handover') {
    return false;
  }
  return (
    need.severity === 'warning' ||
    need.severity === 'critical' ||
    options.hasMeaningfulWorkEvidence === true
  );
}

function isCurrentStateOnlySuggestedAction(id: string): boolean {
  return id === 'refresh-current-state' || id === 'capture-current-state';
}
