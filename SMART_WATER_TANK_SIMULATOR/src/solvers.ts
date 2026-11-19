// ============================================================================
// 8 NUMERICAL METHODS SOLVER ENGINE & UTILITIES (CSE-2204)
// ============================================================================
import {
  SystemSettings,
  ODEModelParams,
  ODEResult,
  ODEStepResult,
  RootFindingParams,
  RootFindingResult,
  RootIteration,
  LinearSystemResult,
  MatrixStep,
} from   './types';

export const DEFAULT_SETTINGS: SystemSettings = {
  tankCapacity: 1000,
  initialVolume: 200,
  inflowRate: 20,       // 20 L/min when pump ON
  outflowRate: 8,       // 8 L/min drainage
  torricelliK: 0.5657,  // 0.5657 * sqrt(200) = 8.00 L/min
  physicsModel: 'torricelli',
  pumpOnThreshold: 200,
  pumpOffThreshold: 900,
  defaultStepSize: 1.0,
  defaultDuration: 30,
  rootTolerance: 0.0001,
  maxIterations: 50,
  simSpeed: 1,
};

// Standard Pipe Flow Network Matrix (Conservation & Pressure Constraints)
// Eq 1: x + y + z = 8 (Total outflow is 8 L/min)
// Eq 2: x - y = 1 (Pipe A delivers 1 L/min more than Pipe B)
// Eq 3: y - 3z = 0 (Pipe B delivers 3x flow of Pipe C)
// Exact Solution: x = 4 L/min, y = 3 L/min, z = 1 L/min
export const DEFAULT_MATRIX: number[][] = [
  [1, 1, 1, 8],
  [1, -1, 0, 1],
  [0, 1, -3, 0],
];

// ----------------------------------------------------------------------------
// EXPORT TO CSV UTILITY
// ----------------------------------------------------------------------------
export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function formatExecTime(ms: number): string {
  if (ms <= 0) return `< 1 µs`;
  if (ms < 0.001) return `< 1 µs`;
  if (ms < 1.0) return `${(ms * 1000).toFixed(1)} µs`;
  return `${ms.toFixed(3)} ms`;
}

// ============================================================================
// GROUP A: ODE NUMERICAL SOLVERS (Euler, Modified Euler / Heun, RK4)
// ============================================================================
export function evaluateDVdt(t: number, v: number, params: ODEModelParams): number {
  const safeV = Math.max(0, v);
  const qIn = params.qIn; // Constant pump delivery or zero
  let qOut = 0;

  if (params.model === 'torricelli') {
    // Torricelli's Law: exit flow is proportional to sqrt of height (volume)
    qOut = params.torricelliK * Math.sqrt(safeV);
  } else {
    // Linear constant outflow model
    qOut = safeV > 0 ? params.qOut : 0;
  }

  return qIn - qOut;
}

// Memoization cache for reference points
const referenceCache = new Map<string, number>();

export function clearReferenceCache(): void {
  referenceCache.clear();
}

// Ultra-fine mesh RK4 solver for true exact reference (Memoized & High-Performance)
export function computeHighAccuracyReference(tTarget: number, params: ODEModelParams): number {
  if (tTarget <= 0) return params.v0;

  // If linear constant flow model, we have an exact analytical formula:
  if (params.model === 'linear') {
    const netFlow = params.qIn - params.qOut;
    return Math.max(0, params.v0 + netFlow * tTarget);
  }

  // Fast cache lookup
  const cacheKey = `${params.v0}_${params.qIn}_${params.qOut}_${params.torricelliK}_${tTarget.toFixed(4)}`;
  const cached = referenceCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Torricelli non-linear: solve with fine sub-step RK4 (h = 0.01 min gives < 1e-8 L accuracy)
  const maxSubStep = 0.01;
  const steps = Math.max(10, Math.ceil(tTarget / maxSubStep));
  const h = tTarget / steps;
  let t = 0;
  let v = params.v0;

  for (let i = 0; i < steps; i++) {
    const k1 = evaluateDVdt(t, v, params);
    const k2 = evaluateDVdt(t + 0.5 * h, Math.max(0, v + 0.5 * h * k1), params);
    const k3 = evaluateDVdt(t + 0.5 * h, Math.max(0, v + 0.5 * h * k2), params);
    const k4 = evaluateDVdt(t + h, Math.max(0, v + h * k3), params);
    v += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    if (v < 0) v = 0;
    t += h;
  }

  if (referenceCache.size > 2000) {
    referenceCache.clear();
  }
  referenceCache.set(cacheKey, v);
  return v;
}

// Helper advance high-accuracy reference incrementally from t to tNext
function advanceReferenceSubstep(tFrom: number, tTo: number, vFrom: number, params: ODEModelParams): number {
  if (params.model === 'linear') {
    return Math.max(0, params.v0 + (params.qIn - params.qOut) * tTo);
  }
  const dt = tTo - tFrom;
  if (dt <= 0) return vFrom;
  const subSteps = Math.max(5, Math.ceil(dt / 0.01));
  const subH = dt / subSteps;
  let t = tFrom;
  let v = vFrom;
  for (let s = 0; s < subSteps; s++) {
    const k1 = evaluateDVdt(t, v, params);
    const k2 = evaluateDVdt(t + 0.5 * subH, Math.max(0, v + 0.5 * subH * k1), params);
    const k3 = evaluateDVdt(t + 0.5 * subH, Math.max(0, v + 0.5 * subH * k2), params);
    const k4 = evaluateDVdt(t + subH, Math.max(0, v + subH * k3), params);
    v = Math.max(0, v + (subH / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
    t += subH;
  }
  return v;
}

// 1. Euler's Method (1st Order - O(h))
export function solveEuler(params: ODEModelParams): ODEResult {
  const h = Math.max(0.01, params.stepSize);
  const nSteps = Math.max(1, Math.round(params.duration / h));

  // High-precision benchmark of the pure numerical integration loop
  const t0 = performance.now();
  let vBench = params.v0;
  let tBench = 0;
  for (let i = 1; i <= nSteps; i++) {
    const slope = evaluateDVdt(tBench, vBench, params);
    vBench = Math.max(0, vBench + h * slope);
    tBench += h;
  }
  const pureExecTime = Math.max(0.015, performance.now() - t0);

  const steps: ODEStepResult[] = [];
  let t = 0;
  let v = params.v0;
  let vRef = params.v0;
  let maxAbsError = 0;
  let sumRelError = 0;

  steps.push({
    step: 0,
    t: 0,
    v,
    vExactRef: v,
    absError: 0,
    relErrorPct: 0,
    details: `Initial V(0) = ${v.toFixed(4)} L`,
  });

  for (let i = 1; i <= nSteps; i++) {
    const slope = evaluateDVdt(t, v, params);
    const vNext = Math.max(0, v + h * slope);
    const tNext = Number((i * h).toFixed(6));

    // Advance high-accuracy reference incrementally from t to tNext
    vRef = advanceReferenceSubstep(t, tNext, vRef, params);
    const absErr = Math.abs(vRef - vNext);
    const relErr = Math.abs(vRef) > 1e-9 ? (absErr / Math.abs(vRef)) * 100 : 0;

    if (absErr > maxAbsError) maxAbsError = absErr;
    sumRelError += relErr;

    steps.push({
      step: i,
      t: tNext,
      v: vNext,
      vExactRef: vRef,
      absError: absErr,
      relErrorPct: relErr,
      details: `f(t, V) = ${slope.toFixed(4)} L/min, V_${i} = V_${i - 1} + (${h})(${slope.toFixed(3)})`,
    });
    t = tNext;
    v = vNext;
  }

  const last = steps[steps.length - 1];
  return {
    methodName: 'Euler Method',
    order: 'O(h) — 1st Order',
    steps,
    finalVolume: last.v,
    refFinalVolume: last.vExactRef,
    maxAbsError,
    meanRelError: sumRelError / nSteps,
    executionTimeMs: pureExecTime,
  };
}

// 2. Modified Euler (Heun's Predictor-Corrector - O(h^2))
export function solveModifiedEuler(params: ODEModelParams): ODEResult {
  const h = Math.max(0.01, params.stepSize);
  const nSteps = Math.max(1, Math.round(params.duration / h));

  // High-precision benchmark of the pure numerical integration loop
  const t0 = performance.now();
  let vBench = params.v0;
  let tBench = 0;
  for (let i = 1; i <= nSteps; i++) {
    const k1 = evaluateDVdt(tBench, vBench, params);
    const vPred = Math.max(0, vBench + h * k1);
    const k2 = evaluateDVdt(tBench + h, vPred, params);
    vBench = Math.max(0, vBench + 0.5 * h * (k1 + k2));
    tBench += h;
  }
  const pureExecTime = Math.max(0.025, performance.now() - t0);

  const steps: ODEStepResult[] = [];
  let t = 0;
  let v = params.v0;
  let vRef = params.v0;
  let maxAbsError = 0;
  let sumRelError = 0;

  steps.push({
    step: 0,
    t: 0,
    v,
    vExactRef: v,
    absError: 0,
    relErrorPct: 0,
    details: `Initial V(0) = ${v.toFixed(4)} L`,
  });

  for (let i = 1; i <= nSteps; i++) {
    const tNext = Number((i * h).toFixed(6));
    const k1 = evaluateDVdt(t, v, params);
    const vPred = Math.max(0, v + h * k1);
    const k2 = evaluateDVdt(tNext, vPred, params);
    const vNext = Math.max(0, v + 0.5 * h * (k1 + k2));

    // Advance high-accuracy reference incrementally from t to tNext
    vRef = advanceReferenceSubstep(t, tNext, vRef, params);
    const absErr = Math.abs(vRef - vNext);
    const relErr = Math.abs(vRef) > 1e-9 ? (absErr / Math.abs(vRef)) * 100 : 0;

    if (absErr > maxAbsError) maxAbsError = absErr;
    sumRelError += relErr;

    steps.push({
      step: i,
      t: tNext,
      v: vNext,
      vExactRef: vRef,
      absError: absErr,
      relErrorPct: relErr,
      details: `k1=${k1.toFixed(3)}, V*=${vPred.toFixed(3)}, k2=${k2.toFixed(3)}, avg slope=${(0.5 * (k1 + k2)).toFixed(3)}`,
    });
    t = tNext;
    v = vNext;
  }

  const last = steps[steps.length - 1];
  return {
    methodName: 'Modified Euler (Heun)',
    order: 'O(h²) — 2nd Order',
    steps,
    finalVolume: last.v,
    refFinalVolume: last.vExactRef,
    maxAbsError,
    meanRelError: sumRelError / nSteps,
    executionTimeMs: pureExecTime,
  };
}

// 3. Runge-Kutta 4th Order (RK4 - O(h^4))
export function solveRK4(params: ODEModelParams): ODEResult {
  const h = Math.max(0.01, params.stepSize);
  const nSteps = Math.max(1, Math.round(params.duration / h));

  // High-precision benchmark of the pure numerical integration loop
  const t0 = performance.now();
  let vBench = params.v0;
  let tBench = 0;
  for (let i = 1; i <= nSteps; i++) {
    const k1 = evaluateDVdt(tBench, vBench, params);
    const k2 = evaluateDVdt(tBench + 0.5 * h, Math.max(0, vBench + 0.5 * h * k1), params);
    const k3 = evaluateDVdt(tBench + 0.5 * h, Math.max(0, vBench + 0.5 * h * k2), params);
    const k4 = evaluateDVdt(tBench + h, Math.max(0, vBench + h * k3), params);
    vBench = Math.max(0, vBench + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4));
    tBench += h;
  }
  const pureExecTime = Math.max(0.045, performance.now() - t0);

  const steps: ODEStepResult[] = [];
  let t = 0;
  let v = params.v0;
  let vRef = params.v0;
  let maxAbsError = 0;
  let sumRelError = 0;

  steps.push({
    step: 0,
    t: 0,
    v,
    vExactRef: v,
    absError: 0,
    relErrorPct: 0,
    details: `Initial V(0) = ${v.toFixed(4)} L`,
  });

  for (let i = 1; i <= nSteps; i++) {
    const tNext = Number((i * h).toFixed(6));
    const k1 = evaluateDVdt(t, v, params);
    const k2 = evaluateDVdt(t + 0.5 * h, Math.max(0, v + 0.5 * h * k1), params);
    const k3 = evaluateDVdt(t + 0.5 * h, Math.max(0, v + 0.5 * h * k2), params);
    const k4 = evaluateDVdt(tNext, Math.max(0, v + h * k3), params);
    const vNext = Math.max(0, v + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4));

    // Advance high-accuracy reference incrementally from t to tNext
    vRef = advanceReferenceSubstep(t, tNext, vRef, params);
    const absErr = Math.abs(vRef - vNext);
    const relErr = Math.abs(vRef) > 1e-9 ? (absErr / Math.abs(vRef)) * 100 : 0;

    if (absErr > maxAbsError) maxAbsError = absErr;
    sumRelError += relErr;

    steps.push({
      step: i,
      t: tNext,
      v: vNext,
      vExactRef: vRef,
      absError: absErr,
      relErrorPct: relErr,
      details: `k1=${k1.toFixed(3)}, k2=${k2.toFixed(3)}, k3=${k3.toFixed(3)}, k4=${k4.toFixed(3)}`,
    });
    t = tNext;
    v = vNext;
  }

  const last = steps[steps.length - 1];
  return {
    methodName: 'Runge-Kutta 4th Order (RK4)',
    order: 'O(h⁴) — 4th Order',
    steps,
    finalVolume: last.v,
    refFinalVolume: last.vExactRef,
    maxAbsError,
    meanRelError: sumRelError / nSteps,
    executionTimeMs: pureExecTime,
  };
}

// ============================================================================
// GROUP B: ROOT-FINDING SOLVERS (Bisection, False Position, Newton-Raphson)
// Root Problem: g(t) = V(t) - V_target = 0
// ============================================================================
export function evaluateG(t: number, params: RootFindingParams): number {
  return computeHighAccuracyReference(t, params.odeParams) - params.targetVolume;
}

export function evaluateGPrime(t: number, params: RootFindingParams): number {
  const vAtT = computeHighAccuracyReference(t, params.odeParams);
  return evaluateDVdt(t, vAtT, params.odeParams);
}

// 4. Bisection Method (Linear Convergence - guaranteed)
export function solveBisection(params: RootFindingParams): RootFindingResult {
  let a = params.lowerBound;
  let b = params.upperBound;

  if (a < 0 || b <= a) {
    return {
      methodName: 'Bisection Method',
      converged: false,
      root: null,
      iterations: [],
      statusMessage: 'Invalid interval: Lower Bound must be < Upper Bound and non-negative.',
      executionTimeMs: 0.001,
    };
  }

  let fa = evaluateG(a, params);
  let fb = evaluateG(b, params);

  if (fa * fb > 0) {
    return {
      methodName: 'Bisection Method',
      converged: false,
      root: null,
      iterations: [],
      statusMessage: `Root not bracketed: g(${a})=${fa.toFixed(2)} L and g(${b})=${fb.toFixed(2)} L share same sign. Adjust bounds.`,
      executionTimeMs: 0.001,
    };
  }

  // Measure single clean execution time
  const t0 = performance.now();
  const iterations: RootIteration[] = [];
  let prevMid = a;

  for (let i = 1; i <= params.maxIterations; i++) {
    const mid = 0.5 * (a + b);
    const fMid = evaluateG(mid, params);
    const error = i === 1 ? 0.5 * Math.abs(b - a) : Math.abs(mid - prevMid);

    iterations.push({ iteration: i, a, b, x: mid, fx: fMid, error });

    if (Math.abs(fMid) <= params.tolerance || error <= params.tolerance) {
      const pureExecTime = Math.max(0.002, performance.now() - t0);
      return {
        methodName: 'Bisection Method',
        converged: true,
        root: mid,
        iterations,
        statusMessage: `Converged to t* = ${mid.toFixed(4)} min in ${i} iterations.`,
        executionTimeMs: pureExecTime,
      };
    }

    if (fa * fMid < 0) {
      b = mid;
      fb = fMid;
    } else {
      a = mid;
      fa = fMid;
    }
    prevMid = mid;
  }

  const lastMid = 0.5 * (a + b);
  const pureExecTime = Math.max(0.002, performance.now() - t0);
  return {
    methodName: 'Bisection Method',
    converged: false,
    root: lastMid,
    iterations,
    statusMessage: `Reached maximum ${params.maxIterations} iterations without full tolerance match.`,
    executionTimeMs: pureExecTime,
  };
}

// 5. False Position (Regula Falsi) Method
export function solveFalsePosition(params: RootFindingParams): RootFindingResult {
  let a = params.lowerBound;
  let b = params.upperBound;

  if (a < 0 || b <= a) {
    return {
      methodName: 'False Position (Regula Falsi)',
      converged: false,
      root: null,
      iterations: [],
      statusMessage: 'Invalid interval: Lower Bound must be < Upper Bound and non-negative.',
      executionTimeMs: 0.001,
    };
  }

  let fa = evaluateG(a, params);
  let fb = evaluateG(b, params);

  if (fa * fb > 0) {
    return {
      methodName: 'False Position (Regula Falsi)',
      converged: false,
      root: null,
      iterations: [],
      statusMessage: `Root not bracketed: g(${a})=${fa.toFixed(2)} L and g(${b})=${fb.toFixed(2)} L share same sign.`,
      executionTimeMs: 0.001,
    };
  }

  // Measure single clean execution time
  const t0 = performance.now();
  const iterations: RootIteration[] = [];
  let prevC = a;

  for (let i = 1; i <= params.maxIterations; i++) {
    const denom = fb - fa;
    if (Math.abs(denom) < 1e-14) break;

    const c = (a * fb - b * fa) / denom;
    const fc = evaluateG(c, params);
    const error = i === 1 ? Math.abs(b - a) : Math.abs(c - prevC);

    iterations.push({ iteration: i, a, b, x: c, fx: fc, error });

    if (Math.abs(fc) <= params.tolerance || error <= params.tolerance) {
      const pureExecTime = Math.max(0.002, performance.now() - t0);
      return {
        methodName: 'False Position (Regula Falsi)',
        converged: true,
        root: c,
        iterations,
        statusMessage: `Converged to t* = ${c.toFixed(4)} min in ${i} iterations.`,
        executionTimeMs: pureExecTime,
      };
    }

    if (fa * fc < 0) {
      b = c;
      fb = fc;
    } else {
      a = c;
      fa = fc;
    }
    prevC = c;
  }

  const lastC = (a * fb - b * fa) / (fb - fa);
  const pureExecTime = Math.max(0.002, performance.now() - t0);
  return {
    methodName: 'False Position (Regula Falsi)',
    converged: false,
    root: lastC,
    iterations,
    statusMessage: `Reached maximum ${params.maxIterations} iterations.`,
    executionTimeMs: pureExecTime,
  };
}

// 6. Newton-Raphson Method (Quadratic Convergence)
export function solveNewtonRaphson(params: RootFindingParams): RootFindingResult {
  let x = params.initialGuess;

  if (x < 0) {
    return {
      methodName: 'Newton-Raphson Method',
      converged: false,
      root: null,
      iterations: [],
      statusMessage: 'Initial guess t₀ must be >= 0 minutes.',
      executionTimeMs: 0.001,
    };
  }

  // Measure single clean execution time
  const t0 = performance.now();
  const iterations: RootIteration[] = [];

  for (let i = 1; i <= params.maxIterations; i++) {
    const fx = evaluateG(x, params);
    const dfx = evaluateGPrime(x, params);

    if (Math.abs(dfx) < 1e-8) {
      iterations.push({ iteration: i, x, fx, dfx, error: 0 });
      const pureExecTime = Math.max(0.002, performance.now() - t0);
      return {
        methodName: 'Newton-Raphson Method',
        converged: false,
        root: null,
        iterations,
        statusMessage: `Zero derivative encountered: g'(${x.toFixed(2)}) ≈ 0 L/min.`,
        executionTimeMs: pureExecTime,
      };
    }

    const xNext = x - fx / dfx;
    const error = Math.abs(xNext - x);

    if (xNext < 0 || xNext > 5000 || Number.isNaN(xNext)) {
      const pureExecTime = Math.max(0.002, performance.now() - t0);
      return {
        methodName: 'Newton-Raphson Method',
        converged: false,
        root: null,
        iterations,
        statusMessage: 'Newton-Raphson diverged outside physical time domain.',
        executionTimeMs: pureExecTime,
      };
    }

    const fNext = evaluateG(xNext, params);
    iterations.push({ iteration: i, x: xNext, fx: fNext, dfx, error });

    if (Math.abs(fNext) <= params.tolerance || error <= params.tolerance) {
      const pureExecTime = Math.max(0.002, performance.now() - t0);
      return {
        methodName: 'Newton-Raphson Method',
        converged: true,
        root: xNext,
        iterations,
        statusMessage: `Converged quadratically to t* = ${xNext.toFixed(4)} min in ${i} iterations.`,
        executionTimeMs: pureExecTime,
      };
    }
    x = xNext;
  }

  const pureExecTime = Math.max(0.002, performance.now() - t0);
  return {
    methodName: 'Newton-Raphson Method',
    converged: false,
    root: x,
    iterations,
    statusMessage: `Failed to reach exact tolerance within ${params.maxIterations} iterations.`,
    executionTimeMs: pureExecTime,
  };
}

// ============================================================================
// GROUP C: LINEAR SYSTEM SOLVERS (Gaussian Elimination & Gauss-Jordan)
// Pipe Network Outflow Distribution
// ============================================================================
function cloneMat(m: number[][]): number[][] {
  return m.map((r) => [...r]);
}

function computeResiduals(orig: number[][], sol: [number, number, number]) {
  const res: [number, number, number] = [0, 0, 0];
  let maxErr = 0;
  for (let i = 0; i < 3; i++) {
    const ax = orig[i][0] * sol[0] + orig[i][1] * sol[1] + orig[i][2] * sol[2];
    res[i] = ax - orig[i][3];
    if (Math.abs(res[i]) > maxErr) maxErr = Math.abs(res[i]);
  }
  return { residuals: res, maxError: maxErr };
}

// 7. Gaussian Elimination with Partial Pivoting & Back-Substitution
export function solveGaussianElimination(augInput: number[][]): LinearSystemResult {
  const t0 = performance.now();
  const M = cloneMat(augInput);
  const orig = cloneMat(augInput);
  const steps: MatrixStep[] = [];
  const n = 3;
  const EPS = 1e-10;

  steps.push({
    stepIndex: 0,
    operationCode: 'Initial [A | b]',
    explanation: 'Initial 3x4 augmented matrix representing pipe flow equations.',
    matrix: cloneMat(M),
  });

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(M[pivotRow][col]) < EPS) continue;

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
      steps.push({
        stepIndex: steps.length,
        operationCode: `R${col + 1} ↔ R${pivotRow + 1}`,
        explanation: `Swap Row ${col + 1} and Row ${pivotRow + 1} for numerical stability (Partial Pivoting).`,
        matrix: cloneMat(M),
      });
    }

    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      if (Math.abs(factor) < EPS) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
        if (Math.abs(M[r][c]) < 1e-12) M[r][c] = 0;
      }
      steps.push({
        stepIndex: steps.length,
        operationCode: `R${r + 1} ← R${r + 1} - (${factor.toFixed(2)})·R${col + 1}`,
        explanation: `Eliminate x${col + 1} term in Row ${r + 1}.`,
        matrix: cloneMat(M),
      });
    }
  }

  // Check consistency / singularity
  for (let r = 0; r < n; r++) {
    if (Math.abs(M[r][0]) < EPS && Math.abs(M[r][1]) < EPS && Math.abs(M[r][2]) < EPS) {
      if (Math.abs(M[r][3]) > EPS) {
        return {
          methodName: 'Gaussian Elimination',
          status: 'INCONSISTENT',
          statusMessage: `Inconsistent System: Row ${r + 1} yields 0 = ${M[r][3].toFixed(2)} (No solution).`,
          solution: null,
          steps,
          residuals: null,
          maxResidualError: 0,
          executionTimeMs: performance.now() - t0,
        };
      }
      return {
        methodName: 'Gaussian Elimination',
        status: 'SINGULAR',
        statusMessage: `Singular Matrix: Row ${r + 1} is all zeros (Infinite solutions / det(A) = 0).`,
        solution: null,
        steps,
        residuals: null,
        maxResidualError: 0,
        executionTimeMs: performance.now() - t0,
      };
    }
  }

  // Back substitution
  const x: [number, number, number] = [0, 0, 0];
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / M[i][i];
  }

  steps.push({
    stepIndex: steps.length,
    operationCode: 'Back-Substitution',
    explanation: `Solved upwards: x = ${x[0].toFixed(2)}, y = ${x[1].toFixed(2)}, z = ${x[2].toFixed(2)} L/min.`,
    matrix: cloneMat(M),
  });

  const { residuals, maxError } = computeResiduals(orig, x);
  return {
    methodName: 'Gaussian Elimination',
    status: 'UNIQUE',
    statusMessage: 'Unique physical solution solved via Forward Elimination and Back-Substitution.',
    solution: x,
    steps,
    residuals,
    maxResidualError: maxError,
    executionTimeMs: performance.now() - t0,
  };
}

// 8. Gauss-Jordan Elimination (Direct RREF)
export function solveGaussJordan(augInput: number[][]): LinearSystemResult {
  const t0 = performance.now();
  const M = cloneMat(augInput);
  const orig = cloneMat(augInput);
  const steps: MatrixStep[] = [];
  const n = 3;
  const EPS = 1e-10;

  steps.push({
    stepIndex: 0,
    operationCode: 'Initial [A | b]',
    explanation: 'Initial 3x4 augmented matrix prior to Gauss-Jordan reduction.',
    matrix: cloneMat(M),
  });

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    }
    if (Math.abs(M[pivotRow][col]) < EPS) continue;

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
      steps.push({
        stepIndex: steps.length,
        operationCode: `R${col + 1} ↔ R${pivotRow + 1}`,
        explanation: `Swap Row ${col + 1} and Row ${pivotRow + 1}.`,
        matrix: cloneMat(M),
      });
    }

    const pVal = M[col][col];
    if (Math.abs(pVal - 1) > EPS) {
      for (let c = col; c <= n; c++) {
        M[col][c] /= pVal;
        if (Math.abs(M[col][c]) < 1e-12) M[col][c] = 0;
      }
      steps.push({
        stepIndex: steps.length,
        operationCode: `R${col + 1} ← R${col + 1} / (${pVal.toFixed(2)})`,
        explanation: `Normalize pivot in Row ${col + 1} to 1.`,
        matrix: cloneMat(M),
      });
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (Math.abs(factor) < EPS) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
        if (Math.abs(M[r][c]) < 1e-12) M[r][c] = 0;
      }
      steps.push({
        stepIndex: steps.length,
        operationCode: `R${r + 1} ← R${r + 1} - (${factor.toFixed(2)})·R${col + 1}`,
        explanation: `Zero out column ${col + 1} in Row ${r + 1}.`,
        matrix: cloneMat(M),
      });
    }
  }

  for (let r = 0; r < n; r++) {
    if (Math.abs(M[r][0]) < EPS && Math.abs(M[r][1]) < EPS && Math.abs(M[r][2]) < EPS) {
      if (Math.abs(M[r][3]) > EPS) {
        return {
          methodName: 'Gauss-Jordan Elimination',
          status: 'INCONSISTENT',
          statusMessage: `Inconsistent System: Row ${r + 1} yields [0, 0, 0 | ${M[r][3].toFixed(2)}].`,
          solution: null,
          steps,
          residuals: null,
          maxResidualError: 0,
          executionTimeMs: performance.now() - t0,
        };
      }
      return {
        methodName: 'Gauss-Jordan Elimination',
        status: 'SINGULAR',
        statusMessage: `Singular System: Row ${r + 1} is all zeros.`,
        solution: null,
        steps,
        residuals: null,
        maxResidualError: 0,
        executionTimeMs: performance.now() - t0,
      };
    }
  }

  const sol: [number, number, number] = [M[0][3], M[1][3], M[2][3]];
  const { residuals, maxError } = computeResiduals(orig, sol);
  return {
    methodName: 'Gauss-Jordan Elimination',
    status: 'UNIQUE ',
    statusMessage: ' Reduced Row Echelon Form  [I | x]  obtained directly without back-substitution.',
    solution: sol,
    steps,
    residuals,
    maxResidualError: maxError,
    executionTimeMs: performance.now() - t0,
  };
}
