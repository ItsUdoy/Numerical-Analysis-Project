// ============================================================================
// SMART WATER TANK SIMULATOR — SHARED BENCHMARK MODULE
// Multi-pass benchmark reporting median execution time and evaluation counts
// ============================================================================

export interface BenchmarkResult<T> {
  result: T;
  medianTimeMs: number;
  evalCount: number;
  repetitions: number;
  formattedTime: string;
  note: string;
}

/**
 * Executes a computation repeatedly over N runs (default 200), computes the median
 * execution time in milliseconds, and returns the result along with complexity metrics.
 */
export function benchmarkFunction<T>(
  fn: () => T,
  evalCountFn: (res: T) => number,
  repetitions: number = 200
): BenchmarkResult<T> {
  // First run to obtain the valid result
  const result = fn();
  const evalCount = evalCountFn(result);

  const times: number[] = [];

  // Run benchmark repetitions
  for (let i = 0; i < repetitions; i++) {
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    times.push(t1 - t0);
  }

  // Sort and take the median
  times.sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianTimeMs = times.length % 2 !== 0 ? times[mid] : (times[mid - 1] + times[mid]) / 2;

  // Format execution time
  let formattedTime = '';
  if (medianTimeMs <= 0 || medianTimeMs < 0.001) {
    formattedTime = '< 1 µs';
  } else if (medianTimeMs < 1.0) {
    formattedTime = `${(medianTimeMs * 1000).toFixed(1)} µs`;
  } else {
    formattedTime = `${medianTimeMs.toFixed(3)} ms`;
  }

  return {
    result,
    medianTimeMs,
    evalCount,
    repetitions,
    formattedTime,
    note: `Measured in-browser, median of ${repetitions} runs`,
  };
}
