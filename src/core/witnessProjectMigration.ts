import * as vscode from 'vscode';
import { ensureDir, readFile } from './artifactWriter';
import {
  AGENTS_ROOT_FILE,
  HARNESS_TEMPLATE_FILES,
  ROOT_DOC_FILES,
  TEMPLATE_FILES,
  loadHarnessTemplate,
  loadTemplate,
} from './templates';
import { getWitnessSubdir, WITNESS_SUBDIRS } from './witnessPaths';

export const WITNESS_SCHEMA_VERSION = '0.3.0';
export const WITNESS_TEMPLATE_VERSION = 'v9.9';
export const WITNESS_VERSION_FILE = 'version.json';

const SUPPORT_ROOT_DOC_FILES = [
  'constitution.md',
  'index.md',
  'commands.md',
  'CHEATSHEET.md',
] as const satisfies readonly (typeof ROOT_DOC_FILES)[number][];

const CURRENT_STATE_V9_MARKERS = [
  'When you finish meaningful work, run `Witness: Save Progress`.',
  'Replace placeholders only with confirmed project facts.',
];

const SESSION_TEMPLATE_V9_MARKERS = [
  'This session starts as a tracking template.',
  'After meaningful work, run `Witness: Save Progress`.',
];

export interface WitnessProjectMigrationNeed {
  migrationNeeded: boolean;
  reasons: string[];
  safeActions: string[];
}

export interface WitnessProjectMigrationResult {
  supportRootDocsWritten: number;
  templatesWritten: number;
  harnessFilesWritten: number;
  agentsRootWritten: boolean;
  versionWritten: boolean;
}

interface WitnessVersionMetadata {
  schemaVersion?: string;
  templateVersion?: string;
}

export async function detectWitnessProjectMigrationNeed(
  witnessRoot: vscode.Uri
): Promise<WitnessProjectMigrationNeed> {
  const reasons: string[] = [];
  const safeActions = new Set<string>();

  const version = await readVersionMetadata(witnessRoot);
  if (version === null) {
    reasons.push('Missing .witness/version.json; treating project as legacy.');
    safeActions.add('Create .witness/version.json.');
  } else {
    if (version.schemaVersion !== WITNESS_SCHEMA_VERSION) {
      reasons.push(
        `.witness/version.json schemaVersion is ${version.schemaVersion ?? 'missing'}.`
      );
      safeActions.add('Update .witness/version.json.');
    }
    if (version.templateVersion !== WITNESS_TEMPLATE_VERSION) {
      reasons.push(
        `.witness/version.json templateVersion is ${version.templateVersion ?? 'missing'}.`
      );
      safeActions.add('Update .witness/version.json.');
    }
  }

  for (const filename of SUPPORT_ROOT_DOC_FILES) {
    if (!(await exists(vscode.Uri.joinPath(witnessRoot, filename)))) {
      reasons.push(`Missing .witness/${filename}.`);
      safeActions.add(`Write .witness/${filename}.`);
    }
  }

  if (!(await exists(vscode.Uri.joinPath(witnessRoot, AGENTS_ROOT_FILE)))) {
    reasons.push(`Missing .witness/${AGENTS_ROOT_FILE}.`);
    safeActions.add(`Write .witness/${AGENTS_ROOT_FILE}.`);
  }

  const harnessDir = getWitnessSubdir(witnessRoot, 'harness');
  for (const filename of HARNESS_TEMPLATE_FILES) {
    if (!(await exists(vscode.Uri.joinPath(harnessDir, filename)))) {
      reasons.push(`Missing .witness/harness/${filename}.`);
      safeActions.add(`Write .witness/harness/${filename}.`);
    }
  }

  const templatesDir = getWitnessSubdir(witnessRoot, 'templates');
  for (const filename of TEMPLATE_FILES) {
    if (!(await exists(vscode.Uri.joinPath(templatesDir, filename)))) {
      reasons.push(`Missing .witness/templates/${filename}.`);
      safeActions.add(`Write .witness/templates/${filename}.`);
    }
  }

  const currentStateText = await readTextOrNull(
    vscode.Uri.joinPath(witnessRoot, 'current-state.md')
  );
  if (
    currentStateText !== null &&
    !CURRENT_STATE_V9_MARKERS.every(marker => currentStateText.includes(marker))
  ) {
    reasons.push('Existing .witness/current-state.md lacks v9 Save Progress guidance.');
    safeActions.add('Leave .witness/current-state.md unchanged.');
  }

  const sessionTemplateText = await readTextOrNull(
    vscode.Uri.joinPath(templatesDir, 'session-template.md')
  );
  if (
    sessionTemplateText !== null &&
    !SESSION_TEMPLATE_V9_MARKERS.every(marker => sessionTemplateText.includes(marker))
  ) {
    reasons.push('Existing .witness/templates/session-template.md lacks v9 Save Progress guidance.');
    safeActions.add('Refresh .witness/templates/session-template.md.');
  }

  return {
    migrationNeeded: reasons.length > 0,
    reasons,
    safeActions: Array.from(safeActions),
  };
}

export async function migrateWitnessProjectSupportFiles(
  context: vscode.ExtensionContext,
  witnessRoot: vscode.Uri
): Promise<WitnessProjectMigrationResult> {
  await ensureDir(witnessRoot);

  for (const subdir of WITNESS_SUBDIRS) {
    await ensureDir(getWitnessSubdir(witnessRoot, subdir));
  }

  let supportRootDocsWritten = 0;
  for (const filename of SUPPORT_ROOT_DOC_FILES) {
    const content = await loadTemplate(context, filename);
    await writeText(vscode.Uri.joinPath(witnessRoot, filename), content);
    supportRootDocsWritten += 1;
  }

  const agentsContent = await loadTemplate(context, AGENTS_ROOT_FILE);
  await writeText(vscode.Uri.joinPath(witnessRoot, AGENTS_ROOT_FILE), agentsContent);

  let templatesWritten = 0;
  const templatesDir = getWitnessSubdir(witnessRoot, 'templates');
  for (const filename of TEMPLATE_FILES) {
    const content = await loadTemplate(context, filename);
    await writeText(vscode.Uri.joinPath(templatesDir, filename), content);
    templatesWritten += 1;
  }

  let harnessFilesWritten = 0;
  const harnessDir = getWitnessSubdir(witnessRoot, 'harness');
  for (const filename of HARNESS_TEMPLATE_FILES) {
    const content = await loadHarnessTemplate(context, filename);
    await writeText(vscode.Uri.joinPath(harnessDir, filename), content);
    harnessFilesWritten += 1;
  }

  await writeVersionMetadata(witnessRoot);

  return {
    supportRootDocsWritten,
    templatesWritten,
    harnessFilesWritten,
    agentsRootWritten: true,
    versionWritten: true,
  };
}

export async function writeVersionMetadata(witnessRoot: vscode.Uri): Promise<void> {
  const metadata = {
    schemaVersion: WITNESS_SCHEMA_VERSION,
    templateVersion: WITNESS_TEMPLATE_VERSION,
    createdBy: 'Witness Agent',
    lastMigratedAt: new Date().toISOString(),
  };

  await writeText(
    vscode.Uri.joinPath(witnessRoot, WITNESS_VERSION_FILE),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
}

async function readVersionMetadata(
  witnessRoot: vscode.Uri
): Promise<WitnessVersionMetadata | null> {
  try {
    const raw = await readFile(vscode.Uri.joinPath(witnessRoot, WITNESS_VERSION_FILE));
    return JSON.parse(raw) as WitnessVersionMetadata;
  } catch {
    return null;
  }
}

async function readTextOrNull(uri: vscode.Uri): Promise<string | null> {
  try {
    return await readFile(uri);
  } catch {
    return null;
  }
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function writeText(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}
