import * as vscode from 'vscode';
import { initProject } from './commands/initProject';
import { enableProject } from './commands/enableProject';
import { startSession } from './commands/startSession';
import { startTrackingTask } from './commands/startTrackingTask';
import { createCheckpoint } from './commands/createCheckpoint';
import { resumeWithWitness } from './commands/resumeWithWitness';
import { recordContext } from './commands/recordContext';
import { observeWorkspace } from './commands/observeWorkspace';
import { createADR } from './commands/createADR';
import { recordSubagent } from './commands/recordSubagent';
import { assessRisk } from './commands/assessRisk';
import { generateHandover } from './commands/generateHandover';
import { validateHandoverCmd } from './commands/validateHandover';
import { createResumeProbe } from './commands/createResumeProbe';
import { compressState } from './commands/compressState';
import { startSubagentTask } from './commands/startSubagentTask';
import { createSubagentContextPacket } from './commands/createSubagentContextPacket';
import { recordSubagentEvidence } from './commands/recordSubagentEvidence';
import { completeSubagentTask } from './commands/completeSubagentTask';
import { reviewSubagentTask } from './commands/reviewSubagentTask';
import { createContextPacket } from './commands/createContextPacket';
import { showWorkspaceStatus } from './commands/showWorkspaceStatus';
import { checkpointNow } from './commands/checkpointNow';
import { prepareSessionSwitch } from './commands/prepareSessionSwitch';
import { resumeSession } from './commands/resumeSession';
import { generateEvaluationSummaryCmd } from './commands/generateEvaluationSummary';
import { resolveContinuityIssue } from './commands/resolveContinuityIssue';
import { initializeWitnessStatusBar } from './core/statusBar';

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/**
 * Called by VS Code when the extension is first activated (on the first
 * matching activationEvent, which is `onCommand:witness.initProject`).
 *
 * Register all commands here and push their disposables into
 * `context.subscriptions` so they are cleaned up when the extension
 * deactivates.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[Witness] Extension activated');

  // -------------------------------------------------------------------------
  // v0.1 skeleton — implemented commands
  // -------------------------------------------------------------------------

  const initProjectCmd = vscode.commands.registerCommand(
    'witness.initProject',
    () => initProject(context)
  );
  context.subscriptions.push(initProjectCmd);

  const startSessionCmd = vscode.commands.registerCommand(
    'witness.startSession',
    () => startSession(context)
  );
  context.subscriptions.push(startSessionCmd);

  const recordContextCmd = vscode.commands.registerCommand(
    'witness.recordContext',
    () => recordContext(context)
  );
  context.subscriptions.push(recordContextCmd);

  const observeWorkspaceCmd = vscode.commands.registerCommand(
    'witness.observeWorkspace',
    () => observeWorkspace(context)
  );
  context.subscriptions.push(observeWorkspaceCmd);

  const createADRCmd = vscode.commands.registerCommand(
    'witness.createADR',
    () => createADR(context)
  );
  context.subscriptions.push(createADRCmd);

  const recordSubagentCmd = vscode.commands.registerCommand(
    'witness.recordSubagent',
    () => recordSubagent(context)
  );
  context.subscriptions.push(recordSubagentCmd);

  const assessRiskCmd = vscode.commands.registerCommand(
    'witness.assessRisk',
    () => assessRisk(context)
  );
  context.subscriptions.push(assessRiskCmd);

  const generateHandoverCmd = vscode.commands.registerCommand(
    'witness.generateHandover',
    () => generateHandover(context)
  );
  context.subscriptions.push(generateHandoverCmd);

  const validateHandoverCommand = vscode.commands.registerCommand(
    'witness.validateHandover',
    () => validateHandoverCmd(context)
  );
  context.subscriptions.push(validateHandoverCommand);

  const createResumeProbeCmd = vscode.commands.registerCommand(
    'witness.createResumeProbe',
    () => createResumeProbe(context)
  );
  context.subscriptions.push(createResumeProbeCmd);

  const compressStateCmd = vscode.commands.registerCommand(
    'witness.compressState',
    () => compressState(context)
  );
  context.subscriptions.push(compressStateCmd);

  const startSubagentTaskCmd = vscode.commands.registerCommand(
    'witness.startSubagentTask',
    () => startSubagentTask(context)
  );
  context.subscriptions.push(startSubagentTaskCmd);

  const createSubagentContextPacketCmd = vscode.commands.registerCommand(
    'witness.createSubagentContextPacket',
    () => createSubagentContextPacket(context)
  );
  context.subscriptions.push(createSubagentContextPacketCmd);

  const recordSubagentEvidenceCmd = vscode.commands.registerCommand(
    'witness.recordSubagentEvidence',
    () => recordSubagentEvidence(context)
  );
  context.subscriptions.push(recordSubagentEvidenceCmd);

  const completeSubagentTaskCmd = vscode.commands.registerCommand(
    'witness.completeSubagentTask',
    () => completeSubagentTask(context)
  );
  context.subscriptions.push(completeSubagentTaskCmd);

  const reviewSubagentTaskCmd = vscode.commands.registerCommand(
    'witness.reviewSubagentTask',
    () => reviewSubagentTask(context)
  );
  context.subscriptions.push(reviewSubagentTaskCmd);

  const createContextPacketCmd = vscode.commands.registerCommand(
    'witness.createContextPacket',
    () => createContextPacket(context)
  );
  context.subscriptions.push(createContextPacketCmd);

  // -------------------------------------------------------------------------
  // v3.1 — Background Continuity Layer: workspace status scanner.
  // -------------------------------------------------------------------------

  const showWorkspaceStatusCmd = vscode.commands.registerCommand(
    'witness.showWorkspaceStatus',
    () => showWorkspaceStatus(context)
  );
  context.subscriptions.push(showWorkspaceStatusCmd);

  // 18 commands registered (17 v1/v2 + 1 v3.1).

  // -------------------------------------------------------------------------
  // v3.5 — Guided Workflow Commands.
  // -------------------------------------------------------------------------

  const checkpointNowCmd = vscode.commands.registerCommand(
    'witness.checkpointNow',
    () => checkpointNow(context)
  );
  context.subscriptions.push(checkpointNowCmd);

  const prepareSessionSwitchCmd = vscode.commands.registerCommand(
    'witness.prepareSessionSwitch',
    () => prepareSessionSwitch(context)
  );
  context.subscriptions.push(prepareSessionSwitchCmd);

  const resumeSessionCmd = vscode.commands.registerCommand(
    'witness.resumeSession',
    () => resumeSession(context)
  );
  context.subscriptions.push(resumeSessionCmd);

  // -------------------------------------------------------------------------
  // v3.6 — Evaluation Summary.
  // -------------------------------------------------------------------------

  const generateEvaluationSummaryCommand = vscode.commands.registerCommand(
    'witness.generateEvaluationSummary',
    () => generateEvaluationSummaryCmd(context)
  );
  context.subscriptions.push(generateEvaluationSummaryCommand);

  // -------------------------------------------------------------------------
  // v4.2 — Resolve Continuity Issue.
  // -------------------------------------------------------------------------

  const resolveContinuityIssueCmd = vscode.commands.registerCommand(
    'witness.resolveContinuityIssue',
    () => resolveContinuityIssue(context)
  );
  context.subscriptions.push(resolveContinuityIssueCmd);

  // -------------------------------------------------------------------------
  // v5.1a — Beginner Command Layer.
  // -------------------------------------------------------------------------
  // These four commands wrap existing session and init logic with plain-language
  // names and beginner-friendly messages. They do not change any existing
  // advanced command behavior.
  // Public command count: 23 → 25 (v5.1a adds enableProject + startTrackingTask).
  // -------------------------------------------------------------------------

  const enableProjectCmd = vscode.commands.registerCommand(
    'witness.enableProject',
    () => enableProject(context)
  );
  context.subscriptions.push(enableProjectCmd);

  const startTrackingTaskCmd = vscode.commands.registerCommand(
    'witness.startTrackingTask',
    () => startTrackingTask(context)
  );
  context.subscriptions.push(startTrackingTaskCmd);

  const createCheckpointCmd = vscode.commands.registerCommand(
    'witness.createCheckpoint',
    () => createCheckpoint(context)
  );
  context.subscriptions.push(createCheckpointCmd);

  const resumeWithWitnessCmd = vscode.commands.registerCommand(
    'witness.resumeWithWitness',
    () => resumeWithWitness(context)
  );
  context.subscriptions.push(resumeWithWitnessCmd);

  // 27 public commands registered (23 pre-v5 + 2 v5.1a + 2 v5.1b beginner commands).

  // -------------------------------------------------------------------------
  // v3.4 — Status Bar Assistant.
  // -------------------------------------------------------------------------
  // initializeWitnessStatusBar registers one internal command
  // (witness.openStatusActions) that is NOT in package.json contributes.commands.
  // Public command count remains 18.
  // -------------------------------------------------------------------------

  initializeWitnessStatusBar(context);
}

// ---------------------------------------------------------------------------
// Deactivation
// ---------------------------------------------------------------------------

/**
 * Called by VS Code when the extension is deactivated (e.g., VS Code closes
 * or the extension is disabled). Add any cleanup logic here if needed.
 */
export function deactivate(): void {
  // No cleanup required for the v0.1 skeleton.
}
