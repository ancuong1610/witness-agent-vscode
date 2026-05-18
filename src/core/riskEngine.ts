// ---------------------------------------------------------------------------
// riskEngine.ts — pure module, no VS Code imports
// ---------------------------------------------------------------------------
// Locked risk vocabulary from Witness constitution.md (Sections 10–11).
// This module is intentionally free of VS Code dependencies so it can be
// unit-tested in isolation.
// ---------------------------------------------------------------------------

/**
 * The five locked risk level strings (Section 11).
 * Do not rename, paraphrase, or invent variants.
 */
export type RiskLevel = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'BLOCKED';

/**
 * Ordered list of the five locked risk levels, lowest to highest severity.
 */
export const RISK_LEVELS: readonly RiskLevel[] = [
  'GREEN',
  'YELLOW',
  'ORANGE',
  'RED',
  'BLOCKED',
];

/**
 * Display labels for the five locked risk dimensions (Section 10).
 * Array order matches the canonical Section 10 order exactly.
 */
export const RISK_DIMENSIONS: readonly {
  key: 'activeContextPressure' | 'artifactExternalizationGap' | 'subagentBoundaryRisk' | 'qualityDrift' | 'phaseBoundaryRisk';
  label: string;
}[] = [
  { key: 'activeContextPressure',      label: 'Active Context Pressure' },
  { key: 'artifactExternalizationGap', label: 'Artifact Externalization Gap' },
  { key: 'subagentBoundaryRisk',       label: 'Subagent Boundary Risk' },
  { key: 'qualityDrift',               label: 'Quality Drift' },
  { key: 'phaseBoundaryRisk',          label: 'Phase Boundary Risk' },
];

/** Union of all valid dimension key strings. */
export type RiskDimensionKey = (typeof RISK_DIMENSIONS)[number]['key'];

/** Maps every locked dimension key to its chosen risk level. */
export type DimensionLevels = Record<RiskDimensionKey, RiskLevel>;

/**
 * Short human-readable description of what each level means (paraphrased from
 * constitution.md, each under 90 characters).
 */
export const RISK_LEVEL_DESCRIPTIONS: Record<RiskLevel, string> = {
  GREEN:   'Safe to continue. All dimensions are low risk.',
  YELLOW:  'One dimension elevated but manageable. Continue with awareness.',
  ORANGE:  'Multiple dimensions stressed, or one severely. Consider a checkpoint.',
  RED:     'High risk. Generate a validated handover before ending the session.',
  BLOCKED: 'Critical. Resolve the specific blocker before continuing.',
};

/**
 * Computes the suggested overall risk level from the five per-dimension levels
 * using the worst-wins rule.
 *
 * Worst-wins rule (evaluated in order; first match wins):
 *
 *   1. if any dimension === BLOCKED  → BLOCKED
 *   2. else if any dimension === RED → RED
 *   3. else if count(ORANGE) >= 2   → RED
 *   4. else if count(ORANGE) === 1  → ORANGE
 *   5. else if count(YELLOW) >= 3   → ORANGE
 *   6. else if count(YELLOW) >= 1   → YELLOW
 *   7. else (all GREEN)             → GREEN
 *
 * @param dims - The per-dimension level selections.
 * @returns The computed overall RiskLevel.
 */
export function computeOverall(dims: DimensionLevels): RiskLevel {
  const levels = Object.values(dims) as RiskLevel[];

  // Rule 1: any BLOCKED → BLOCKED
  if (levels.some(l => l === 'BLOCKED')) {
    return 'BLOCKED';
  }

  // Rule 2: any RED → RED
  if (levels.some(l => l === 'RED')) {
    return 'RED';
  }

  const orangeCount = levels.filter(l => l === 'ORANGE').length;
  const yellowCount = levels.filter(l => l === 'YELLOW').length;

  // Rule 3: two or more ORANGE → RED
  if (orangeCount >= 2) {
    return 'RED';
  }

  // Rule 4: exactly one ORANGE → ORANGE
  if (orangeCount === 1) {
    return 'ORANGE';
  }

  // Rule 5: three or more YELLOW → ORANGE
  if (yellowCount >= 3) {
    return 'ORANGE';
  }

  // Rule 6: one or two YELLOW → YELLOW
  if (yellowCount >= 1) {
    return 'YELLOW';
  }

  // Rule 7: all GREEN → GREEN
  return 'GREEN';
}
