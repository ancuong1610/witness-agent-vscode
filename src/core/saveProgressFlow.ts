// ---------------------------------------------------------------------------
// saveProgressFlow.ts — pure planning helpers for Guided Save Progress.
// ---------------------------------------------------------------------------
//
// Keeps v9.3 recommendation logic separate from VS Code UI code so the command
// can stay small and the recommendation rules can be checked without opening
// QuickPick.
//
// ---------------------------------------------------------------------------

import { WitnessWorkspaceStatus } from './workspaceStatusTypes';
import { MaintenanceNeedKind } from './maintenanceTriggerEngine';

export type SaveProgressAction =
  | 'save-current-progress'
  | 'save-and-update-memory'
  | 'save-decision-note'
  | 'prepare-resume-context'
  | 'cancel';

export type SaveProgressMode = 'start-required' | 'guided';

export interface SaveProgressPlanInput {
  status: WitnessWorkspaceStatus;
  maintenanceKind: MaintenanceNeedKind;
  hasMeaningfulWorkEvidence?: boolean;
  currentStateHasPlaceholders?: boolean;
}

export interface SaveProgressPlan {
  mode: SaveProgressMode;
  recommendedAction?: SaveProgressAction;
  actions: SaveProgressAction[];
}

export const SAVE_PROGRESS_ACTIONS: SaveProgressAction[] = [
  'save-current-progress',
  'save-and-update-memory',
  'save-decision-note',
  'prepare-resume-context',
  'cancel',
];

export function buildSaveProgressPlan(
  input: SaveProgressPlanInput
): SaveProgressPlan {
  if (input.status.activeSessionId === null) {
    return {
      mode: 'start-required',
      actions: ['cancel'],
    };
  }

  return {
    mode: 'guided',
    recommendedAction: chooseRecommendedAction(input),
    actions: [...SAVE_PROGRESS_ACTIONS],
  };
}

function chooseRecommendedAction(input: SaveProgressPlanInput): SaveProgressAction {
  if (
    input.currentStateHasPlaceholders === true ||
    input.maintenanceKind === 'update-current-state'
  ) {
    return 'save-and-update-memory';
  }

  if (
    input.hasMeaningfulWorkEvidence === true ||
    input.maintenanceKind === 'create-checkpoint'
  ) {
    return 'save-current-progress';
  }

  return 'save-current-progress';
}
