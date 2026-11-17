// ============================================================================
// SMART WATER TANK SIMULATOR — 3x3 MATRIX & HYDRAULIC MANIFOLD UTILITIES
// Exact determinant, 1-norm condition number, and feasibility validation
// ============================================================================

/**
 * Computes exact determinant of a 3x3 matrix via Laplace expansion:
 * det(A) = a00*(a11*a22 - a12*a21) - a01*(a10*a22 - a12*a20) + a02*(a10*a21 - a11*a20)
 */
export function computeDeterminant3x3(A: number[][]): number {
  const [r0, r1, r2] = A;
  const det =
    r0[0] * (r1[1] * r2[2] - r1[2] * r2[1]) -
    r0[1] * (r1[0] * r2[2] - r1[2] * r2[0]) +
    r0[2] * (r1[0] * r2[1] - r1[1] * r2[0]);
  return det;
}

/**
 * Computes exact inverse of a 3x3 matrix.
 * Returns null if det(A) == 0.
 */
export function computeInverse3x3(A: number[][]): number[][] | null {
  const det = computeDeterminant3x3(A);
  if (Math.abs(det) < 1e-12) return null;

  const [r0, r1, r2] = A;
  const invDet = 1 / det;

  return [
    [
      (r1[1] * r2[2] - r1[2] * r2[1]) * invDet,
      (r0[2] * r2[1] - r0[1] * r2[2]) * invDet,
      (r0[1] * r1[2] - r0[2] * r1[1]) * invDet,
    ],
    [
      (r1[2] * r2[0] - r1[0] * r2[2]) * invDet,
      (r0[0] * r2[2] - r0[2] * r2[0]) * invDet,
      (r0[2] * r1[0] - r0[0] * r1[2]) * invDet,
    ],
    [
      (r1[0] * r2[1] - r1[1] * r2[0]) * invDet,
      (r0[1] * r2[0] - r0[0] * r2[1]) * invDet,
      (r0[0] * r1[1] - r0[1] * r1[0]) * invDet,
    ],
  ];
}

/**
 * Computes the 1-norm of a 3x3 matrix:
 * ||A||_1 = max_j sum_i |a_ij| (maximum column sum).
 */
export function computeMatrixNorm1(A: number[][]): number {
  let maxColSum = 0;
  for (let col = 0; col < 3; col++) {
    const colSum = Math.abs(A[0][col]) + Math.abs(A[1][col]) + Math.abs(A[2][col]);
    if (colSum > maxColSum) maxColSum = colSum;
  }
  return maxColSum;
}

export interface ConditionNumberResult {
  kappa1: number;
  normA: number;
  normInvA: number;
  category: 'Well-Conditioned' | 'Moderately Conditioned' | 'Ill-Conditioned';
  badgeColor: string;
  explanation: string;
}

/**
 * Computes condition number κ₁(A) = ||A||₁ · ||A⁻¹||₁ using the 1-norm.
 */
export function computeConditionNumber1(A: number[][]): ConditionNumberResult {
  const det = computeDeterminant3x3(A);
  if (Math.abs(det) < 1e-12) {
    return {
      kappa1: Infinity,
      normA: computeMatrixNorm1(A),
      normInvA: Infinity,
      category: 'Ill-Conditioned',
      badgeColor: 'bg-rose-500/15 text-rose-500 border-rose-500/30',
      explanation: 'Matrix is singular (det(A) = 0). System has no unique physical solution.',
    };
  }

  const invA = computeInverse3x3(A)!;
  const normA = computeMatrixNorm1(A);
  const normInvA = computeMatrixNorm1(invA);
  const kappa1 = normA * normInvA;

  let category: 'Well-Conditioned' | 'Moderately Conditioned' | 'Ill-Conditioned' = 'Well-Conditioned';
  let badgeColor = 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
  let explanation = 'κ₁ < 10: System is robust against round-off errors and input noise.';

  if (kappa1 > 100) {
    category = 'Ill-Conditioned';
    badgeColor = 'bg-rose-500/15 text-rose-500 border-rose-500/30';
    explanation = 'κ₁ > 100: Highly sensitive to small parameter changes. Solution may lose significance.';
  } else if (kappa1 >= 10) {
    category = 'Moderately Conditioned';
    badgeColor = 'bg-amber-500/15 text-amber-500 border-amber-500/30';
    explanation = '10 ≤ κ₁ ≤ 100: Moderate numerical stability. Standard elimination remains accurate.';
  }

  return {
    kappa1,
    normA,
    normInvA,
    category,
    badgeColor,
    explanation,
  };
}

export interface FeasibilityResult {
  isFeasible: boolean;
  warningMessage: string | null;
  clampedStrokeWidths: {
    pipeA: number;
    pipeB: number;
    pipeC: number;
  };
}

/**
 * Validates pipe flow feasibility (qA >= 0, qB >= 0, qC >= 0) and computes
 * proportional pipe stroke widths in the 2px - 14px range.
 */
export function validateFlowFeasibility(
  qA: number,
  qB: number,
  qC: number,
  totalQ: number
): FeasibilityResult {
  const isNegative = qA < 0 || qB < 0 || qC < 0;
  let warningMessage: string | null = null;

  if (isNegative) {
    const invalidPipes: string[] = [];
    if (qA < 0) invalidPipes.push(`Pipe A (${qA.toFixed(2)} L/min)`);
    if (qB < 0) invalidPipes.push(`Pipe B (${qB.toFixed(2)} L/min)`);
    if (qC < 0) invalidPipes.push(`Pipe C (${qC.toFixed(2)} L/min)`);

    warningMessage = `Hydraulic infeasibility: Reverse back-flow predicted in ${invalidPipes.join(
      ', '
    )}. Reduce Flow Difference (x - y) or adjust manifold ratio to restore forward flow.`;
  }

  // Calculate pipe widths in 2-14px range based on flow share
  const maxFlow = Math.max(totalQ, 1);
  const clampStroke = (q: number) => {
    if (q <= 0) return 2;
    const ratio = Math.min(1, q / maxFlow);
    return Math.max(2, Math.min(14, 2 + ratio * 12));
  };

  return {
    isFeasible: !isNegative,
    warningMessage,
    clampedStrokeWidths: {
      pipeA: clampStroke(qA),
      pipeB: clampStroke(qB),
      pipeC: clampStroke(qC),
    },
  };
}
