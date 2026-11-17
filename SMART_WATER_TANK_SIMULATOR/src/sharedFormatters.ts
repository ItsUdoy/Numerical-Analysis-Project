// ============================================================================
// SMART WATER TANK SIMULATOR — SHARED FORMATTERS & METHOD IDENTITIES
// Consistent scientific notation, units, and visual identities across all pages
// ============================================================================

export const METHOD_IDENTITIES = {
  reference: {
    id: 'reference',
    name: 'Reference solution (RK4, h = 0.01 min)',
    shortName: 'Reference',
    order: 'O(h⁴) Ground Truth',
    color: '#94A3B8', // Neutral slate
    lineStyle: 'dashed',
    dashArray: '5 5',
    strokeWidth: 2,
    badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  },
  euler: {
    id: 'euler',
    name: 'Euler Method',
    shortName: 'Euler',
    order: 'O(h) — 1st Order',
    color: '#F59E0B', // Amber
    lineStyle: 'solid',
    dashArray: 'none',
    strokeWidth: 2,
    dotType: 'circle',
    badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
  modEuler: {
    id: 'modEuler',
    name: 'Modified Euler (Heun)',
    shortName: 'Heun',
    order: 'O(h²) — 2nd Order',
    color: '#06B6D4', // Cyan
    lineStyle: 'dashed',
    dashArray: '5 5',
    strokeWidth: 2,
    dotType: 'square',
    badgeColor: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  },
  rk4: {
    id: 'rk4',
    name: 'Runge-Kutta 4th Order (RK4)',
    shortName: 'RK4',
    order: 'O(h⁴) — 4th Order',
    color: '#10B981', // Emerald
    lineStyle: 'solid',
    dashArray: 'none',
    strokeWidth: 2.5,
    dotType: 'diamond',
    badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  bisection: {
    id: 'bisection',
    name: 'Bisection Method',
    shortName: 'Bisection',
    rate: 'Linear Order O(1)',
    color: '#F59E0B',
    badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
  falsePosition: {
    id: 'falsePosition',
    name: 'False Position (Regula Falsi)',
    shortName: 'False Position',
    rate: 'Linear (can stagnate: one endpoint stays fixed)',
    color: '#06B6D4',
    badgeColor: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
  },
  newton: {
    id: 'newton',
    name: 'Newton-Raphson Method',
    shortName: 'Newton-Raphson',
    rate: 'Quadratic Order O(2)',
    color: '#10B981',
    badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  gaussElim: {
    id: 'gaussElim',
    name: 'Gaussian Elimination',
    shortName: 'Gauss Elim',
    flops: '(1/3)n³ + n² textbook mult/div (~2/3 n³ total flops)',
    color: '#3B82F6',
    badgeColor: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  },
  gaussJordan: {
    id: 'gaussJordan',
    name: 'Gauss-Jordan Elimination',
    shortName: 'Gauss-Jordan',
    flops: '(1/2)n³ + n² textbook mult/div (~n³ total flops)',
    color: '#10B981',
    badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  pipeA: {
    id: 'pipeA',
    name: 'Pipe A (Zone 1)',
    color: '#3B82F6', // Blue
  },
  pipeB: {
    id: 'pipeB',
    name: 'Pipe B (Zone 2)',
    color: '#10B981', // Green
  },
  pipeC: {
    id: 'pipeC',
    name: 'Pipe C (Zone 3)',
    color: '#F59E0B', // Amber
  },
} as const;

/**
 * Format numerical error in scientific notation with 3 significant digits.
 * Never outputs "0.0000" or "0.0000%".
 */
export function formatErrorSci(val: number | null | undefined, isPercentage: boolean = false): string {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  const abs = Math.abs(val);
  const suffix = isPercentage ? '%' : '';

  if (abs === 0) return `< 1.00e-6${suffix}`;
  if (abs < 1e-6) return `< 1.00e-6${suffix}`;
  if (abs >= 1000) return `${val.toExponential(2)}${suffix}`;

  // Format with exactly 3 significant digits in exponential notation (e.g. 1.76e+0 or 4.61e-3)
  return `${val.toExponential(2)}${suffix}`;
}

/**
 * Format volume in Liters:
 * - In tables: fixed 4 decimals (e.g. 235.1245 L)
 * - In summaries: 2 decimals (e.g. 235.12 L)
 */
export function formatVolume(val: number | null | undefined, precision: 'table' | 'summary' = 'summary'): string {
  if (val === null || val === undefined || isNaN(val)) return '— L';
  if (precision === 'table') {
    return `${val.toFixed(4)} L`;
  }
  return `${val.toFixed(2)} L`;
}

/**
 * Format flow rate in Liters per minute:
 * ALWAYS uses "L/min", NEVER "L/m".
 */
export function formatFlowRate(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '— L/min';
  return `${val.toFixed(2)} L/min`;
}

/**
 * Format time in minutes and optional mm:ss.
 * ALWAYS uses "min", NEVER "m".
 */
export function formatTime(val: number | null | undefined, includeSecs: boolean = false): string {
  if (val === null || val === undefined || isNaN(val)) return '— min';
  if (!includeSecs) {
    return `${val.toFixed(2)} min`;
  }
  const mins = Math.floor(val);
  const secs = Math.round((val - mins) * 60);
  return `${val.toFixed(2)} min (${mins}m ${secs}s)`;
}

/**
 * Format execution time:
 * Shows microseconds (µs) when < 1 ms, milliseconds (ms) otherwise.
 */
export function formatExecutionTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || isNaN(ms) || ms <= 0) return '< 1 µs';
  if (ms < 0.001) return '< 1 µs';
  if (ms < 1.0) return `${(ms * 1000).toFixed(1)} µs`;
  return `${ms.toFixed(3)} ms`;
}
