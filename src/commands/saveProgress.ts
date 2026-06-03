// ---------------------------------------------------------------------------
// saveProgress.ts — Witness: Save Progress guided workflow (v9.3).
// ---------------------------------------------------------------------------
//
// Main post-work entry point. Guides the developer from "I did meaningful
// work" to the right preservation step without changing the underlying
// checkpoint, memory-update, validation, or resume commands.
//
// Design invariants:
//   - Does not write Witness artifacts directly.
//   - Does not call an LLM.
//   - Does not inject prompts automatically.
//   - Does not approve memory updates automatically.
//   - Does not remove or alter witness.createCheckpoint behavior.
//   - Emits one telemetry event on exit, without prompt text or file contents.
//
// ---------------------------------------------------------------------------

import * as vscode from 'vscode';
import { getWorkspaceRoot, getWitnessRoot } from '../core/witnessPaths';
import { getCurrentSessionId } from '../core/sessionRegistry';
import { computeWorkspaceStatus, WitnessWorkspaceStatus } from '../core/workspaceStatus';
import {
  computeMaintenanceNeed,
  MaintenanceNeed,
  MaintenanceNeedKind,
} from '../core/maintenanceTriggerEngine';
import { observeGit } from '../core/gitObserver';
import { presentPrompt } from '../core/promptPresenter';
import {
  generateArtifactMaintenancePrompt,
} from '../core/artifactMaintenancePromptGenerator';
import { refreshWitnessStatusBar } from '../core/statusBar';
import {
  buildSaveProgressPlan,
  SaveProgressAction,
} from '../core/saveProgressFlow';
import {
  createCommandTimer,
  emitWitnessEvent,
} from '../core/telemetryWriter';

interface SaveProgressQuickPickItem extends vscode.QuickPickItem {
  action: SaveProgressAction;
}

interface SaveProgressTelemetryState {
  selectedOption: string | null;
  hadActiveSession: boolean;
  maintenanceKind: string;
  checkpointInvoked: boolean;
  updateMemoryInvoked: boolean;
  checkMemoryOffered: boolean;
  completed: boolean;
  cancelledAt: string | null;
}

const CURRENT_STATE_PLACEHOLDER_MARKERS = [
  '{{',
  'TODO',
  'MANDATORY',
  '[MISSING',
  '<fill',
];

export async function saveProgress(
  _context: vscode.ExtensionContext
): Promise<void> {
  const elapsed = createCommandTimer();
  const telemetry: SaveProgressTelemetryState = {
    selectedOption: null,
    hadActiveSession: false,
    maintenanceKind: 'unknown',
    checkpointInvoked: false,
    updateMemoryInvoked: false,
    checkMemoryOffered: false,
    completed: false,
    cancelledAt: null,
  };

  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
      telemetry.cancelledAt = 'no-workspace';
      vscode.window.showErrorMessage('Witness: Open a folder first.');
      await emitSaveProgressTelemetry(workspaceRoot, null, elapsed(), telemetry, 'cancelled');
      return;
    }

    const status = await computeWorkspaceStatus(workspaceRoot);
    telemetry.hadActiveSession = status.activeSessionId !== null;

    const maintenanceNeed = computeMaintenanceNeed({ status });
    telemetry.maintenanceKind = maintenanceNeed.kind;

    const plan = buildSaveProgressPlan({
      status,
      maintenanceKind: maintenanceNeed.kind,
      hasMeaningfulWorkEvidence: await detectMeaningfulWorkEvidence(workspaceRoot),
      currentStateHasPlaceholders: await currentStateHasPlaceholders(workspaceRoot),
    });

    if (plan.mode === 'start-required') {
      await handleStartRequired(workspaceRoot, telemetry);
      await emitSaveProgressTelemetry(
        workspaceRoot,
        status.activeSessionId,
        elapsed(),
        telemetry,
        telemetry.completed ? 'success' : 'cancelled'
      );
      return;
    }

    const picked = await vscode.window.showQuickPick(
      buildQuickPickItems(plan.recommendedAction),
      {
        title: 'What should Witness save?',
        placeHolder: 'Choose the next progress-saving step',
      }
    );

    if (!picked || picked.action === 'cancel') {
      telemetry.selectedOption = picked?.action ?? null;
      telemetry.cancelledAt = picked ? 'cancel-option' : 'quickpick-dismissed';
      await emitSaveProgressTelemetry(
        workspaceRoot,
        status.activeSessionId,
        elapsed(),
        telemetry,
        'cancelled'
      );
      return;
    }

    telemetry.selectedOption = picked.action;
    await runSelectedAction(picked.action, telemetry, status, maintenanceNeed);
    telemetry.completed = true;

    await refreshWitnessStatusBar();
    await emitSaveProgressTelemetry(
      workspaceRoot,
      status.activeSessionId,
      elapsed(),
      telemetry,
      'success'
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    telemetry.cancelledAt = telemetry.cancelledAt ?? 'unhandled-error';
    await emitSaveProgressTelemetry(
      getWorkspaceRoot(),
      null,
      elapsed(),
      telemetry,
      'error'
    );
    vscode.window.showErrorMessage(`Witness: Save Progress failed — ${message}`);
  }
}

function buildQuickPickItems(
  recommendedAction: SaveProgressAction | undefined
): SaveProgressQuickPickItem[] {
  const baseItems: SaveProgressQuickPickItem[] = [
    {
      label: 'Save current progress',
      description: 'Create a checkpoint using the existing save workflow.',
      action: 'save-current-progress',
    },
    {
      label: 'Save progress + update project memory',
      description: 'Create a checkpoint, then generate an update-memory prompt.',
      action: 'save-and-update-memory',
    },
    {
      label: 'Save architecture or decision note',
      description: 'Open a memory-first prompt for confirmed decisions.',
      action: 'save-decision-note',
    },
    {
      label: 'Prepare resume context',
      description: 'Generate a resume prompt for a later coding-agent session.',
      action: 'prepare-resume-context',
    },
    {
      label: 'Cancel',
      description: 'Do not save anything right now.',
      action: 'cancel',
    },
  ];

  if (!recommendedAction) {
    return baseItems;
  }

  const recommended = baseItems.find(item => item.action === recommendedAction);
  if (!recommended) {
    return baseItems;
  }

  return [
    {
      ...recommended,
      label: `Recommended: ${recommended.label}`,
    },
    ...baseItems.filter(item => item.action !== recommendedAction),
  ];
}

async function handleStartRequired(
  workspaceRoot: vscode.Uri,
  telemetry: SaveProgressTelemetryState
): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    'Witness: Start a task before saving progress.',
    'Start',
    'Cancel'
  );

  if (choice !== 'Start') {
    telemetry.cancelledAt = choice === 'Cancel' ? 'start-cancelled' : 'start-dismissed';
    return;
  }

  telemetry.selectedOption = 'start';
  await vscode.commands.executeCommand('witness.start');
  telemetry.completed = true;
  await refreshWitnessStatusBar();

  const witnessRoot = getWitnessRoot(workspaceRoot);
  const sessionId = await getCurrentSessionId(witnessRoot);
  telemetry.hadActiveSession = sessionId !== undefined;
}

async function runSelectedAction(
  action: SaveProgressAction,
  telemetry: SaveProgressTelemetryState,
  status: WitnessWorkspaceStatus,
  maintenanceNeed: MaintenanceNeed
): Promise<void> {
  switch (action) {
    case 'save-current-progress':
      await runCheckpoint(telemetry);
      vscode.window.showInformationMessage(
        'Witness: Progress saved. Continue coding or run Witness: Resume later.'
      );
      return;

    case 'save-and-update-memory':
      await runCheckpoint(telemetry);
      vscode.window.showInformationMessage(
        'Witness: Progress saved. Opening memory-update prompt...'
      );
      if (await openMemoryUpdatePromptAfterSaveProgress(telemetry, maintenanceNeed)) {
        await offerCheckMemoryUpdate(telemetry);
      }
      return;

    case 'save-decision-note':
      await openDecisionNotePrompt(status, maintenanceNeed.kind);
      return;

    case 'prepare-resume-context':
      await vscode.commands.executeCommand('witness.resume');
      return;

    case 'cancel':
      return;
  }
}

async function runCheckpoint(telemetry: SaveProgressTelemetryState): Promise<void> {
  await vscode.commands.executeCommand('witness.createCheckpoint');
  telemetry.checkpointInvoked = true;
}

async function offerCheckMemoryUpdate(
  telemetry: SaveProgressTelemetryState
): Promise<void> {
  telemetry.checkMemoryOffered = true;
  const choice = await vscode.window.showInformationMessage(
    'Witness: After your coding agent updates `.witness/`, run `Witness: Check Memory Update`.',
    'Check Memory Update'
  );

  if (choice === 'Check Memory Update') {
    await vscode.commands.executeCommand('witness.checkMemoryUpdate');
  }
}

async function openMemoryUpdatePromptAfterSaveProgress(
  telemetry: SaveProgressTelemetryState,
  fallbackNeed: MaintenanceNeed
): Promise<boolean> {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('Witness: Open a folder first.');
    return false;
  }

  const status = await computeWorkspaceStatus(workspaceRoot);
  const latestNeed = computeMaintenanceNeed({ status });
  const need = latestNeed.kind === 'none' ? fallbackNeed : latestNeed;

  const generated = generateArtifactMaintenancePrompt({
    kind: 'update-current-state',
    maintenanceTitle: need.kind === 'none' ? 'Update project memory' : need.title,
    maintenanceReason:
      need.kind === 'none'
        ? 'Save Progress requested a memory update after meaningful work.'
        : need.reason,
    evidence: need.evidence,
    activeSessionId: status.activeSessionId,
    taskGoal: null,
  });

  const result = await presentPrompt(
    generated.prompt,
    'Witness: Memory-update prompt ready. Paste it into your coding agent. After it updates `.witness/`, run `Witness: Check Memory Update`.'
  );

  telemetry.updateMemoryInvoked = result.promptOpened;
  if (!result.promptOpened) {
    vscode.window.showWarningMessage(
      'Witness: Memory-update prompt could not be opened. Run Witness: Update Memory and try again.'
    );
  }

  return result.promptOpened;
}

async function openDecisionNotePrompt(
  status: WitnessWorkspaceStatus,
  maintenanceKind: MaintenanceNeedKind
): Promise<void> {
  const prompt = [
    '# Witness Decision Memory Update',
    '',
    'You are helping update Witness project memory after the developer made or confirmed an architecture or product decision.',
    '',
    'Rules:',
    '- Update only `.witness/` artifacts.',
    '- capture the decision first in `.witness/current-state.md`.',
    '- capture it in `.witness/sessions/<activeSessionId>.md` for the active session.',
    '- Create an ADR candidate only if the decision is stable and developer-approved.',
    '- Do not create an ADR automatically.',
    '- Do not invent facts.',
    '- Record uncertainty explicitly when facts are incomplete.',
    '- Record uncertainty in both current-state and the active session when needed.',
    '- Mention validation results and the next safe step.',
    '',
    'Current Witness evidence:',
    `- Active session: ${status.activeSessionId ?? 'none'}`,
    `- Maintenance need: ${maintenanceKind}`,
    '',
    'After editing `.witness/` files, tell the developer to run `Witness: Check Memory Update`.',
  ].join('\n');

  await presentPrompt(
    prompt,
    'Witness: Decision memory prompt ready. Paste it into your coding agent.'
  );
}

async function detectMeaningfulWorkEvidence(
  workspaceRoot: vscode.Uri
): Promise<boolean | undefined> {
  const git = await observeGit(workspaceRoot);
  const dirtyPaths = git.primary?.dirtyFilePaths;
  if (dirtyPaths === undefined) {
    return undefined;
  }

  return dirtyPaths.some(filePath => {
    const normalized = filePath.replace(/\\/g, '/');
    return !(normalized === '.witness' || normalized.startsWith('.witness/'));
  });
}

async function currentStateHasPlaceholders(
  workspaceRoot: vscode.Uri
): Promise<boolean | undefined> {
  try {
    const currentStateUri = vscode.Uri.joinPath(
      getWitnessRoot(workspaceRoot),
      'current-state.md'
    );
    const bytes = await vscode.workspace.fs.readFile(currentStateUri);
    const text = new TextDecoder().decode(bytes.slice(0, 4096));
    return CURRENT_STATE_PLACEHOLDER_MARKERS.some(marker => text.includes(marker));
  } catch {
    return undefined;
  }
}

async function emitSaveProgressTelemetry(
  workspaceRoot: vscode.Uri | undefined,
  sessionId: string | null,
  durationMs: number,
  telemetry: SaveProgressTelemetryState,
  status: 'success' | 'cancelled' | 'error'
): Promise<void> {
  await emitWitnessEvent({
    workspaceRoot,
    eventName: 'witness.save_progress.guided',
    commandId: 'witness.saveProgress',
    sessionId,
    status,
    durationMs,
    attributes: {
      selected_option: telemetry.selectedOption,
      had_active_session: telemetry.hadActiveSession,
      maintenance_kind: telemetry.maintenanceKind,
      checkpoint_invoked: telemetry.checkpointInvoked,
      update_memory_invoked: telemetry.updateMemoryInvoked,
      check_memory_offered: telemetry.checkMemoryOffered,
      completed: telemetry.completed,
      cancelled_at: telemetry.cancelledAt,
    },
  });
}
