import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Sliders,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Download,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Zap,
  HelpCircle,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  ODEModelParams,
  RootFindingParams,
  RootFindingResult,
  RootIteration,
} from '../types';
import {
  solveBisection,
  solveFalsePosition,
  solveNewtonRaphson,
  evaluateG,
  exportToCSV,
  formatExecTime,
} from '../solvers';
import { soundFx } from '../utils/audio';

interface PredictionSectionProps {
  baseOdeParams: ODEModelParams;
}

export const PredictionSection: React.FC<PredictionSectionProps> = ({ baseOdeParams }) => {
  const [targetVol, setTargetVol] = useState<number>(500);
  const [scenario, setScenario] = useState<'filling' | 'draining'>('filling');
  const [modelType, setModelType] = useState<'torricelli' | 'linear'>('torricelli');
  const [tolerance, setTolerance] = useState<number>(0.0001);

  // Chart interactivity states
  const [scaleType, setScaleType] = useState<'log' | 'linear'>('log');
  const [visibleSeries, setVisibleSeries] = useState<{
    Bisection: boolean;
    FalsePosition: boolean;
    Newton: boolean;
  }>({
    Bisection: true,
    FalsePosition: true,
    Newton: true,
  });

  // Iteration details table states
  const [isTableOpen, setIsTableOpen] = useState<boolean>(true);
  const [activeTableTab, setActiveTableTab] = useState<'bisection' | 'falsePosition' | 'newton'>('newton');

  // Active tooltip hover state for card info
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // Physical scenario parameter configuration
  const predictionOdeParams: ODEModelParams = useMemo(() => {
    if (scenario === 'filling') {
      return {
        ...baseOdeParams,
        v0: 200,
        duration: 120,
        qIn: 20,
        qOut: 8,
        torricelliK: 0.5657,
        model: modelType,
      };
    } else {
      return {
        ...baseOdeParams,
        v0: 900,
        duration: 150,
        qIn: 0,
        qOut: 8,
        torricelliK: 0.5657,
        model: modelType,
      };
    }
  }, [baseOdeParams, scenario, modelType]);

  // Dynamically calculate bounds and initial guess so roots are guaranteed bracketed
  const { lowerBound, upperBound, initialGuess } = useMemo(() => {
    if (scenario === 'filling') {
      const ub = targetVol >= 750 ? 120 : targetVol >= 550 ? 80 : 60;
      const guess = Math.max(5, (targetVol - 200) / 10);
      return { lowerBound: 0, upperBound: ub, initialGuess: guess };
    } else {
      const ub = 140;
      const guess = Math.max(10, (900 - targetVol) / 8);
      return { lowerBound: 0, upperBound: ub, initialGuess: guess };
    }
  }, [scenario, targetVol]);

  const rootParams: RootFindingParams = useMemo(
    () => ({
      targetVolume: targetVol,
      lowerBound,
      upperBound,
      initialGuess,
      tolerance,
      maxIterations: 50,
      odeParams: predictionOdeParams,
    }),
    [targetVol, lowerBound, upperBound, initialGuess, tolerance, predictionOdeParams]
  );

  // Compute 3 root-finding solvers
  const bisectionRes = useMemo(() => solveBisection(rootParams), [rootParams]);
  const falsePosRes = useMemo(() => solveFalsePosition(rootParams), [rootParams]);
  const newtonRes = useMemo(() => solveNewtonRaphson(rootParams), [rootParams]);

  // Theoretical bisection step calculation: ⌈log₂((b - a) / ε)⌉
  const theoreticalBisectionSteps = useMemo(() => {
    const span = Math.abs(upperBound - lowerBound);
    if (span <= 0 || tolerance <= 0) return 0;
    return Math.ceil(Math.log2(span / tolerance));
  }, [upperBound, lowerBound, tolerance]);

  // Validation: Check reachability in current scenario
  const reachabilityIssue = useMemo(() => {
    if (scenario === 'filling') {
      if (targetVol <= 200) {
        return `Target (${targetVol} L) is at or below starting volume (200 L). Choose a volume > 200 L for filling.`;
      }
      if (targetVol > 1000) {
        return `Target (${targetVol} L) exceeds maximum tank capacity (1000 L).`;
      }
    } else {
      if (targetVol >= 900) {
        return `Target (${targetVol} L) is at or above starting volume (900 L). Choose a volume < 900 L for draining.`;
      }
      if (targetVol < 0) {
        return `Target (${targetVol} L) cannot be negative.`;
      }
    }
    return null;
  }, [scenario, targetVol]);

  // Fastest method determination based on actual iterations
  const fastestMethod = useMemo(() => {
    const candidates = [
      { name: 'Bisection', iters: bisectionRes.converged ? bisectionRes.iterations.length : Infinity },
      { name: 'False Position', iters: falsePosRes.converged ? falsePosRes.iterations.length : Infinity },
      { name: 'Newton-Raphson', iters: newtonRes.converged ? newtonRes.iterations.length : Infinity },
    ];
    const minIters = Math.min(...candidates.map((c) => c.iters));
    if (minIters === Infinity) return null;
    return candidates.find((c) => c.iters === minIters)?.name || null;
  }, [bisectionRes, falsePosRes, newtonRes]);

  // Agreement and headline calculation
  const headlineData = useMemo(() => {
    const bestRoot = newtonRes.root ?? falsePosRes.root ?? bisectionRes.root;
    if (bestRoot === null || reachabilityIssue) return null;

    const mins = Math.floor(bestRoot);
    const secs = Math.round((bestRoot - mins) * 60);
    const arrivalTime = new Date(Date.now() + bestRoot * 60000);
    const clockStr = arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Calculate agreement delta between converged methods
    const converged = [
      { name: 'Bisection', root: bisectionRes.root },
      { name: 'False Position', root: falsePosRes.root },
      { name: 'Newton-Raphson', root: newtonRes.root },
    ].filter((m): m is { name: string; root: number } => m.root !== null);

    let agreementNote = 'All three methods agree (Δ < 1e-4 min)';
    let isAgreement = true;

    if (converged.length >= 2) {
      const roots = converged.map((m) => m.root);
      const diff = Math.max(...roots) - Math.min(...roots);
      isAgreement = diff <= 1e-4;
      if (isAgreement) {
        agreementNote = `All 3 methods agree (Δ = ${diff < 1e-6 ? '< 1e-6' : diff.toExponential(2)} min)`;
      } else {
        agreementNote = `Methods deviate slightly (max Δ = ${diff.toFixed(4)} min)`;
      }
    }

    return {
      bestRoot,
      mins,
      secs,
      clockStr,
      agreementNote,
      isAgreement,
    };
  }, [bisectionRes, falsePosRes, newtonRes, reachabilityIssue]);

  // Error chart dataset with floor clamping to 1e-12 so log scale never truncates
  const ERROR_FLOOR = 1e-12;
  const errorChartData = useMemo(() => {
    const maxIters = Math.max(
      bisectionRes.iterations.length,
      falsePosRes.iterations.length,
      newtonRes.iterations.length
    );
    if (maxIters === 0) return [];

    const data: Array<{
      iteration: number;
      Bisection?: number;
      FalsePosition?: number;
      Newton?: number;
      BisectionX?: number;
      FalsePositionX?: number;
      NewtonX?: number;
      isNewtonConverged?: boolean;
      isBisectionConverged?: boolean;
      isFalsePosConverged?: boolean;
    }> = [];

    for (let i = 1; i <= maxIters; i++) {
      const bIt = bisectionRes.iterations.find((it) => it.iteration === i);
      const fIt = falsePosRes.iterations.find((it) => it.iteration === i);
      const nIt = newtonRes.iterations.find((it) => it.iteration === i);

      const bErr = bIt ? Math.max(ERROR_FLOOR, bIt.error) : undefined;
      const fErr = fIt ? Math.max(ERROR_FLOOR, fIt.error) : undefined;
      const nErr = nIt ? Math.max(ERROR_FLOOR, nIt.error) : undefined;

      data.push({
        iteration: i,
        Bisection: bErr,
        FalsePosition: fErr,
        Newton: nErr,
        BisectionX: bIt?.x,
        FalsePositionX: fIt?.x,
        NewtonX: nIt?.x,
        isBisectionConverged: i === bisectionRes.iterations.length && bisectionRes.converged,
        isFalsePosConverged: i === falsePosRes.iterations.length && falsePosRes.converged,
        isNewtonConverged: i === newtonRes.iterations.length && newtonRes.converged,
      });
    }
    return data;
  }, [bisectionRes, falsePosRes, newtonRes]);

  // Function evaluations count
  const evalCounts = useMemo(() => ({
    bisection: 2 + bisectionRes.iterations.length,
    falsePosition: 2 + falsePosRes.iterations.length,
    newton: 2 * newtonRes.iterations.length,
  }), [bisectionRes, falsePosRes, newtonRes]);

  // Format final error residue cleanly
  const formatResidue = (root: number | null) => {
    if (root === null) return 'N/A';
    const res = Math.abs(evaluateG(root, rootParams));
    if (res < 1e-6) return '< 1e-6 L';
    return `${res.toExponential(3)} L`;
  };

  // Slider bounds and fill percentage
  const sliderMin = scenario === 'filling' ? 250 : 50;
  const sliderMax = scenario === 'filling' ? 950 : 850;
  const sliderFillPercent = Math.min(
    100,
    Math.max(0, ((targetVol - sliderMin) / (sliderMax - sliderMin)) * 100)
  );

  // Toggle series visibility
  const toggleSeries = (key: 'Bisection' | 'FalsePosition' | 'Newton') => {
    soundFx.playClick();
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Export full prediction CSV
  const handleExportAll = () => {
    soundFx.playClick();
    const headers = [
      'Iteration',
      'Bisection_x_min',
      'Bisection_Err_min',
      'FalsePos_x_min',
      'FalsePos_Err_min',
      'Newton_x_min',
      'Newton_Err_min',
    ];
    const maxIters = Math.max(
      bisectionRes.iterations.length,
      falsePosRes.iterations.length,
      newtonRes.iterations.length
    );
    const rows = [];
    for (let i = 0; i < maxIters; i++) {
      const b = bisectionRes.iterations[i];
      const f = falsePosRes.iterations[i];
      const n = newtonRes.iterations[i];
      rows.push([
        i + 1,
        b ? b.x.toFixed(4) : '',
        b ? b.error.toExponential(3) : '',
        f ? f.x.toFixed(4) : '',
        f ? f.error.toExponential(3) : '',
        n ? n.x.toFixed(4) : '',
        n ? n.error.toExponential(3) : '',
      ]);
    }
    exportToCSV(`root_finding_prediction_${scenario}_${targetVol}L`, headers, rows);
  };

  // Export active iteration table CSV
  const handleExportActiveTable = () => {
    soundFx.playClick();
    if (activeTableTab === 'bisection') {
      const headers = ['Step (k)', 'Lower Bound a (min)', 'Upper Bound b (min)', 'Midpoint c (min)', 'Residue g(c) (L)', 'Step Error |Δx| (min)'];
      const rows = bisectionRes.iterations.map((it) => [
        it.iteration,
        it.a?.toFixed(4) ?? '',
        it.b?.toFixed(4) ?? '',
        it.x.toFixed(4),
        it.fx.toExponential(4),
        it.error.toExponential(4),
      ]);
      exportToCSV(`bisection_steps_${targetVol}L`, headers, rows);
    } else if (activeTableTab === 'falsePosition') {
      const headers = ['Step (k)', 'Lower Bound a (min)', 'Upper Bound b (min)', 'Root Estimate c (min)', 'Residue g(c) (L)', 'Step Error |Δx| (min)'];
      const rows = falsePosRes.iterations.map((it) => [
        it.iteration,
        it.a?.toFixed(4) ?? '',
        it.b?.toFixed(4) ?? '',
        it.x.toFixed(4),
        it.fx.toExponential(4),
        it.error.toExponential(4),
      ]);
      exportToCSV(`false_position_steps_${targetVol}L`, headers, rows);
    } else {
      const headers = ['Step (k)', 'Estimate t_k (min)', 'Residue g(t_k) (L)', 'Tangent Slope gPrime (L/min)', 'Step Correction |Δt| (min)'];
      const rows = newtonRes.iterations.map((it) => [
        it.iteration,
        it.x.toFixed(4),
        it.fx.toExponential(4),
        it.dfx ? it.dfx.toFixed(4) : '',
        it.error.toExponential(4),
      ]);
      exportToCSV(`newton_steps_${targetVol}L`, headers, rows);
    }
  };

  // Custom Chart Tooltip
  const CustomPredictionTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl p-3 shadow-xl text-xs space-y-2 backdrop-blur-md min-w-[220px]">
        <div className="font-semibold text-[var(--text-primary)] border-b border-[var(--border)] pb-1 flex items-center justify-between">
          <span>Iteration k = {label}</span>
          <span className="text-[10px] text-[var(--text-muted)] font-mono">ε = {tolerance}</span>
        </div>
        {payload.map((item: any, idx: number) => {
          if (item.value === undefined || item.value === null) return null;
          const color = item.color || item.stroke || 'var(--accent)';
          const xVal = item.payload[`${item.dataKey}X`];
          const isFinal = item.payload[`is${item.dataKey === 'Newton' ? 'Newton' : item.dataKey === 'FalsePosition' ? 'FalsePos' : 'Bisection'}Converged`];

          return (
            <div key={idx} className="flex items-center justify-between gap-4 py-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[var(--text-secondary)] font-medium">
                  {item.name || item.dataKey}:
                </span>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-[var(--text-primary)] font-semibold flex items-center justify-end gap-1">
                  {item.value <= ERROR_FLOOR ? '< 1e-12' : item.value.toExponential(2)}
                  {isFinal && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" title="Converged" />
                  )}
                </div>
                {xVal !== undefined && (
                  <div className="text-[10px] text-[var(--text-muted)]">
                    t = {Number(xVal).toFixed(3)} min
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Target Volume & Scenario Controls Card */}
      <div className="card-surface p-6 rounded-xl border border-[var(--border)] shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold text-base text-[var(--text-primary)] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[var(--accent)]" /> Water Level Arrival Horizon Prediction
            </h3>
            <p className="text-[var(--text-secondary)] text-xs mt-0.5">
              High-precision root-finding engine solving g(t) = V(t) − V_tgt = 0 to pinpoint exact arrival time.
            </p>
          </div>
          <button
            onClick={handleExportAll}
            className="px-3.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--accent)] font-semibold text-xs flex items-center gap-1.5 transition shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Comparison CSV</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-1">
          {/* Target Volume Slider & Presets */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label className="text-[var(--text-secondary)] font-medium flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" /> Target Volume:
              </label>
              <span className="px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-bold font-mono">
                {targetVol} L
              </span>
            </div>

            <div className="relative pt-1 pb-1">
              <input
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={10}
                value={targetVol}
                onChange={(e) => setTargetVol(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${sliderFillPercent}%, var(--bg-elevated) ${sliderFillPercent}%, var(--bg-elevated) 100%)`,
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono mt-1">
                <span>{sliderMin} L</span>
                <span className="text-[var(--accent)] font-semibold">{targetVol} L</span>
                <span>{sliderMax} L</span>
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex gap-1.5 pt-1">
              {[300, 500, 700, 900].map((v) => {
                const isActive = targetVol === v;
                return (
                  <button
                    key={v}
                    onClick={() => {
                      soundFx.playClick();
                      setTargetVol(v);
                    }}
                    className={`flex-1 py-1.5 rounded-md text-xs font-semibold font-mono border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm scale-102'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                    }`}
                  >
                    {v}L
                  </button>
                );
              })}
            </div>
          </div>

          {/* Physical Scenario Segmented Control */}
          <div className="space-y-2">
            <label className="block text-[var(--text-secondary)] text-xs font-medium">
              Physical Scenario:
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)]">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setScenario('filling');
                  setTargetVol(500);
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  scenario === 'filling'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>Filling</span>
                </div>
                <span className="text-[10px] font-normal opacity-90">200 L → {targetVol} L</span>
              </button>

              <button
                onClick={() => {
                  soundFx.playClick();
                  setScenario('draining');
                  setTargetVol(300);
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  scenario === 'draining'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Draining</span>
                </div>
                <span className="text-[10px] font-normal opacity-90">900 L → {targetVol} L</span>
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] text-center">
              {scenario === 'filling' ? 'Pump inflow: 20 L/min · Start: 200 L' : 'Gravity outflow: Torricelli · Start: 900 L'}
            </p>
          </div>

          {/* Governing ODE Model */}
          <div className="space-y-2">
            <label className="block text-[var(--text-secondary)] text-xs font-medium">
              Governing Model:
            </label>
            <select
              value={modelType}
              onChange={(e) => {
                soundFx.playClick();
                setModelType(e.target.value as any);
              }}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] outline-none cursor-pointer"
            >
              <option value="torricelli">Torricelli Non-Linear (k√V)</option>
              <option value="linear">Linear Model (dV/dt = const)</option>
            </select>
            <p className="text-[11px] text-[var(--text-muted)]">
              {modelType === 'torricelli' ? 'Physics-accurate gravity orifice outflow' : 'Constant nominal net discharge rate'}
            </p>
          </div>

          {/* Tolerance ε */}
          <div className="space-y-2">
            <label className="block text-[var(--text-secondary)] text-xs font-medium">
              Convergence Tolerance (ε):
            </label>
            <select
              value={tolerance}
              onChange={(e) => {
                soundFx.playClick();
                setTolerance(Number(e.target.value));
              }}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)] rounded-lg p-2.5 text-xs text-[var(--text-primary)] outline-none font-mono cursor-pointer"
            >
              <option value="0.001">10⁻³ min (~0.06 s - Fast)</option>
              <option value="0.0001">10⁻⁴ min (~0.006 s - Standard)</option>
              <option value="0.000001">10⁻⁶ min (High Precision)</option>
            </select>
            <p className="text-[11px] text-[var(--text-muted)]">
              Stops when error |Δx| &lt; ε or residue |g(t)| &lt; ε
            </p>
          </div>
        </div>

        {/* Reachability Alert Banner if Target is Unreachable */}
        {reachabilityIssue && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-[var(--warning)] text-xs animate-pulse">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div className="flex-1 font-medium">{reachabilityIssue}</div>
          </div>
        )}
      </div>

      {/* Result Headline Banner */}
      {headlineData && (
        <div className="card-surface p-4 sm:p-5 rounded-xl border border-[var(--border)] shadow-md bg-gradient-to-r from-[var(--bg-surface)] via-[var(--bg-elevated)]/40 to-[var(--bg-surface)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide uppercase bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                  {scenario === 'filling' ? 'Filling Horizon' : 'Draining Horizon'}
                </span>
                <h4 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  Tank reaches {targetVol} L in about {headlineData.mins} min {headlineData.secs} s{' '}
                  <span className="text-[var(--text-secondary)] font-normal">
                    (at {headlineData.clockStr})
                  </span>
                </h4>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Net arrival time: <span className="font-mono font-semibold text-[var(--text-primary)]">{headlineData.bestRoot.toFixed(3)} min</span> ({Math.round(headlineData.bestRoot * 60)} seconds) · {scenario === 'filling' ? 'Starting at 200 L' : 'Starting at 900 L'}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                headlineData.isAgreement
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
                  : 'bg-amber-500/10 text-amber-500 border-amber-500/25'
              }`}>
                {headlineData.isAgreement ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{headlineData.agreementNote}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3 Solver Result Cards (Identical Structure) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
        {/* 1. Bisection Method Card */}
        <div className="card-surface rounded-xl border border-[var(--border)] border-t-4 border-t-amber-500 p-5 shadow-md flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-bold text-sm text-[var(--text-primary)]">1. Bisection Method</span>
              </div>
              {fastestMethod === 'Bisection' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Fastest ({bisectionRes.iterations.length} iters)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/25">
                  Linear Order O(1)
                </span>
              )}
            </div>

            {/* Row 1: Predicted Time */}
            <div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] font-mono tabular-nums">
                {bisectionRes.root !== null ? (
                  <>
                    {bisectionRes.root.toFixed(3)}{' '}
                    <span className="text-base font-normal text-[var(--text-secondary)]">min</span>
                  </>
                ) : (
                  <span className="text-rose-500 text-xl">Failed</span>
                )}
              </div>
              {bisectionRes.root !== null && (
                <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                  ≈ {Math.floor(bisectionRes.root)}m {Math.round((bisectionRes.root % 1) * 60)}s
                </div>
              )}
            </div>
          </div>

          {/* Row 2 to 5: Standardized Metric Rows */}
          <div className="space-y-2 text-xs border-t border-[var(--border)] pt-3 text-[var(--text-secondary)]">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Required Iterations:</span>
              <span className="font-bold font-mono text-amber-500">
                {bisectionRes.iterations.length} iters
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Theoretical Steps:</span>
              <span className="font-mono text-[var(--text-primary)] text-[11px]">
                ⌈log₂((b−a)/ε)⌉ = {theoreticalBisectionSteps}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Final Residue |g(t*)|:</span>
              <span className="font-mono text-[var(--text-primary)]">
                {formatResidue(bisectionRes.root)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Evaluations / Time:</span>
              <span className="font-mono text-[var(--text-primary)]">
                {evalCounts.bisection} evals · {formatExecTime(bisectionRes.executionTimeMs)}
              </span>
            </div>

            <div className="relative flex justify-between items-center pt-1 border-t border-[var(--border)]/50">
              <div className="flex items-center gap-1 text-[var(--text-muted)]">
                <span>Mechanism:</span>
                <button
                  type="button"
                  onClick={() => setActiveTooltip(activeTooltip === 'bisection' ? null : 'bisection')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                  title="Interval halving mechanism"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="font-medium text-[var(--text-primary)]">Interval Halving</span>

              {activeTooltip === 'bisection' && (
                <div className="absolute bottom-7 left-0 right-0 p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] shadow-xl z-20">
                  Guaranteed convergence by halving bracket [a, b] each step. Never diverges, but slowest rate.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. False Position Method Card */}
        <div className="card-surface rounded-xl border border-[var(--border)] border-t-4 border-t-cyan-500 p-5 shadow-md flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
                <span className="font-bold text-sm text-[var(--text-primary)]">2. False Position</span>
              </div>
              {fastestMethod === 'False Position' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Fastest ({falsePosRes.iterations.length} iters)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/10 text-cyan-500 border border-cyan-500/25">
                  Superlinear O(1.618)
                </span>
              )}
            </div>

            {/* Row 1: Predicted Time */}
            <div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] font-mono tabular-nums">
                {falsePosRes.root !== null ? (
                  <>
                    {falsePosRes.root.toFixed(3)}{' '}
                    <span className="text-base font-normal text-[var(--text-secondary)]">min</span>
                  </>
                ) : (
                  <span className="text-rose-500 text-xl">Failed</span>
                )}
              </div>
              {falsePosRes.root !== null && (
                <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                  ≈ {Math.floor(falsePosRes.root)}m {Math.round((falsePosRes.root % 1) * 60)}s
                </div>
              )}
            </div>
          </div>

          {/* Row 2 to 5: Standardized Metric Rows */}
          <div className="space-y-2 text-xs border-t border-[var(--border)] pt-3 text-[var(--text-secondary)]">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Required Iterations:</span>
              <span className="font-bold font-mono text-cyan-500">
                {falsePosRes.iterations.length} iters
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Stagnation Notice:</span>
              <span className="font-mono text-[var(--text-primary)] text-[11px]">
                One-sided endpoint lock
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Final Residue |g(t*)|:</span>
              <span className="font-mono text-[var(--text-primary)]">
                {formatResidue(falsePosRes.root)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Evaluations / Time:</span>
              <span className="font-mono text-[var(--text-primary)]">
                {evalCounts.falsePosition} evals · {formatExecTime(falsePosRes.executionTimeMs)}
              </span>
            </div>

            <div className="relative flex justify-between items-center pt-1 border-t border-[var(--border)]/50">
              <div className="flex items-center gap-1 text-[var(--text-muted)]">
                <span>Mechanism:</span>
                <button
                  type="button"
                  onClick={() => setActiveTooltip(activeTooltip === 'falsePosition' ? null : 'falsePosition')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                  title="Secant interpolation details"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="font-medium text-[var(--text-primary)]">Secant Interpolation</span>

              {activeTooltip === 'falsePosition' && (
                <div className="absolute bottom-7 left-0 right-0 p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] shadow-xl z-20">
                  Draws a secant chord between brackets. Faster than bisection, but can lock on one stagnant endpoint.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Newton-Raphson Method Card */}
        <div className="card-surface rounded-xl border border-[var(--border)] border-t-4 border-t-emerald-500 p-5 shadow-md flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rotate-45 bg-emerald-500" />
                <span className="font-bold text-sm text-[var(--text-primary)]">3. Newton-Raphson</span>
              </div>
              {fastestMethod === 'Newton-Raphson' ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 flex items-center gap-1 shadow-sm">
                  <Zap className="w-3 h-3 text-emerald-500 fill-emerald-500" /> Fastest ({newtonRes.iterations.length} iters)
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                  Quadratic Order O(2)
                </span>
              )}
            </div>

            {/* Row 1: Predicted Time */}
            <div>
              <div className="text-3xl font-extrabold text-[var(--text-primary)] font-mono tabular-nums">
                {newtonRes.root !== null ? (
                  <>
                    {newtonRes.root.toFixed(3)}{' '}
                    <span className="text-base font-normal text-[var(--text-secondary)]">min</span>
                  </>
                ) : (
                  <span className="text-rose-500 text-xl">Failed</span>
                )}
              </div>
              {newtonRes.root !== null && (
                <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5">
                  ≈ {Math.floor(newtonRes.root)}m {Math.round((newtonRes.root % 1) * 60)}s
                </div>
              )}
            </div>
          </div>

          {/* Row 2 to 5: Standardized Metric Rows */}
          <div className="space-y-2 text-xs border-t border-[var(--border)] pt-3 text-[var(--text-secondary)]">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Required Iterations:</span>
              <span className="font-bold font-mono text-emerald-500">
                {newtonRes.iterations.length} iters
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Tangent Derivative:</span>
              <span className="font-mono text-[var(--text-primary)] text-[11px]">
                g'(t) = dV/dt (Net Flow)
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Final Residue |g(t*)|:</span>
              <span className="font-mono text-[var(--text-primary)]">
                {formatResidue(newtonRes.root)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Evaluations / Time:</span>
              <span className="font-mono text-[var(--text-primary)]">
                {evalCounts.newton} evals · {formatExecTime(newtonRes.executionTimeMs)}
              </span>
            </div>

            <div className="relative flex justify-between items-center pt-1 border-t border-[var(--border)]/50">
              <div className="flex items-center gap-1 text-[var(--text-muted)]">
                <span>Mechanism:</span>
                <button
                  type="button"
                  onClick={() => setActiveTooltip(activeTooltip === 'newton' ? null : 'newton')}
                  className="hover:text-[var(--text-primary)] cursor-pointer"
                  title="Tangent slope mechanism details"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="font-medium text-[var(--text-primary)]">Tangent Slope g'(t)</span>

              {activeTooltip === 'newton' && (
                <div className="absolute bottom-7 left-0 right-0 p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] shadow-xl z-20">
                  Projects tangent slope using instantaneous flow dV/dt. Doubles correct precision digits each step.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Convergence Speed Comparison Chart */}
      <div className="card-surface rounded-xl border border-[var(--border)] p-5 sm:p-6 shadow-md space-y-4">
        {/* Chart Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
          <div>
            <h4 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--accent)]" /> Convergence Speed Comparison (|Δx| vs Iteration)
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Newton-Raphson reached tolerance ε = {tolerance} in {newtonRes.iterations.length} iterations.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Scale Toggle: Logarithmic vs Linear */}
            <div className="flex items-center p-0.5 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] text-xs">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setScaleType('log');
                }}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  scaleType === 'log'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Log₁₀ Scale
              </button>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setScaleType('linear');
                }}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                  scaleType === 'linear'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Linear Scale
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Method Pills Legend (Placed Above Chart at Top-Left, no overlap with x-axis) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[var(--text-muted)] text-[11px] font-medium mr-1">Toggle Series:</span>
          <button
            onClick={() => toggleSeries('Bisection')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all cursor-pointer ${
              visibleSeries.Bisection
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 font-semibold'
                : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Bisection ({bisectionRes.iterations.length} iters)</span>
          </button>

          <button
            onClick={() => toggleSeries('FalsePosition')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all cursor-pointer ${
              visibleSeries.FalsePosition
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-500 font-semibold'
                : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
            <span>False Position ({falsePosRes.iterations.length} iters)</span>
          </button>

          <button
            onClick={() => toggleSeries('Newton')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all cursor-pointer ${
              visibleSeries.Newton
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500 font-semibold'
                : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
            }`}
          >
            <span className="w-2.5 h-2.5 rotate-45 bg-emerald-500" />
            <span>Newton-Raphson ({newtonRes.iterations.length} iters)</span>
          </button>
        </div>

        {/* Recharts LineChart */}
        <div className="w-full h-80 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={errorChartData}
              margin={{ top: 16, right: 35, left: 15, bottom: 26 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <XAxis
                dataKey="iteration"
                stroke="var(--text-secondary)"
                tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                label={{
                  value: 'Iteration (k)',
                  position: 'insideBottom',
                  offset: -16,
                  fill: 'var(--text-secondary)',
                  fontSize: 12,
                }}
              />
              <YAxis
                scale={scaleType === 'log' ? 'log' : 'linear'}
                domain={scaleType === 'log' ? [1e-12, 100] : [0, 'auto']}
                stroke="var(--text-secondary)"
                tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                tickFormatter={(v) => {
                  if (scaleType === 'log') {
                    if (v <= ERROR_FLOOR) return '1e-12';
                    return v.toExponential(0);
                  }
                  return v < 0.01 ? v.toExponential(1) : v.toFixed(3);
                }}
                label={{
                  value: 'Absolute error |Δx| (min)',
                  angle: -90,
                  position: 'insideLeft',
                  offset: -2,
                  fill: 'var(--text-secondary)',
                  fontSize: 12,
                }}
              />
              <Tooltip content={<CustomPredictionTooltip />} />

              {/* Reference line at selected tolerance */}
              <ReferenceLine
                y={tolerance}
                stroke="var(--warning)"
                strokeDasharray="4 4"
                label={{
                  value: `Tolerance ε = ${tolerance}`,
                  fill: 'var(--warning)',
                  fontSize: 11,
                  position: 'top',
                }}
              />

              {/* 1. Bisection Line */}
              {visibleSeries.Bisection && (
                <Line
                  type="monotone"
                  dataKey="Bisection"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: '#f59e0b' }}
                  activeDot={{ r: 6, fill: '#f59e0b' }}
                  name="Bisection"
                />
              )}

              {/* 2. False Position Line (Dashed) */}
              {visibleSeries.FalsePosition && (
                <Line
                  type="monotone"
                  dataKey="FalsePosition"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 4, fill: '#06b6d4' }}
                  activeDot={{ r: 6, fill: '#06b6d4' }}
                  name="False Position"
                />
              )}

              {/* 3. Newton-Raphson Line (Distinct Diamond Markers) */}
              {visibleSeries.Newton && (
                <Line
                  type="monotone"
                  dataKey="Newton"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={(props: any) => {
                    const { cx, cy, payload, key } = props;
                    if (!cx || !cy) return <g key={key || 'empty'} />;
                    if (payload && payload.isNewtonConverged) {
                      return (
                        <g key={`newton-converged-${payload.iteration}`}>
                          <circle cx={cx} cy={cy} r={6} fill="#10b981" fillOpacity={0.3} />
                          <polygon
                            points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`}
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                        </g>
                      );
                    }
                    return (
                      <polygon
                        key={key || `newton-${payload?.iteration}`}
                        points={`${cx},${cy - 3.5} ${cx + 3.5},${cy} ${cx},${cy + 3.5} ${cx - 3.5},${cy}`}
                        fill="#10b981"
                      />
                    );
                  }}
                  activeDot={{ r: 6, fill: '#10b981' }}
                  name="Newton-Raphson"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* New: Collapsible Iteration Details Table */}
      <div className="card-surface rounded-xl border border-[var(--border)] overflow-hidden shadow-md">
        {/* Table Accordion Header */}
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-elevated)]/30 border-b border-[var(--border)]">
          <button
            onClick={() => {
              soundFx.playClick();
              setIsTableOpen(!isTableOpen);
            }}
            className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition cursor-pointer text-left"
          >
            {isTableOpen ? (
              <ChevronUp className="w-4 h-4 text-[var(--accent)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--accent)]" />
            )}
            <span>View Iteration Steps &amp; Residue Trajectory</span>
          </button>

          {isTableOpen && (
            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              {/* Method Switcher Tabs */}
              <div className="flex items-center p-0.5 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] text-xs">
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setActiveTableTab('newton');
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                    activeTableTab === 'newton'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Newton-Raphson ({newtonRes.iterations.length})
                </button>
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setActiveTableTab('falsePosition');
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                    activeTableTab === 'falsePosition'
                      ? 'bg-cyan-500 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  False Position ({falsePosRes.iterations.length})
                </button>
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setActiveTableTab('bisection');
                  }}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                    activeTableTab === 'bisection'
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Bisection ({bisectionRes.iterations.length})
                </button>
              </div>

              {/* Export Active Table CSV */}
              <button
                onClick={handleExportActiveTable}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Download step data for this method"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Table Content */}
        {isTableOpen && (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {activeTableTab === 'newton' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border)] z-10 text-[var(--text-secondary)]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Step (k)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Estimate t_k (min)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Residue g(t_k) [L]</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Tangent g'(t_k) [L/min]</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Step Correction |Δt|</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                  {newtonRes.iterations.map((it, idx) => {
                    const isFinal = idx === newtonRes.iterations.length - 1 && newtonRes.converged;
                    return (
                      <tr
                        key={it.iteration}
                        className={`transition-colors ${
                          isFinal
                            ? 'bg-emerald-500/10 font-bold border-l-4 border-emerald-500'
                            : idx % 2 === 0
                            ? 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]/60'
                            : 'bg-[var(--bg-elevated)]/25 hover:bg-[var(--bg-elevated)]/60'
                        }`}
                      >
                        <td className="py-2 px-4 text-[var(--text-secondary)]">{it.iteration}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-primary)]">{it.x.toFixed(4)}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">
                          {Math.abs(it.fx) < 1e-6 ? '< 1e-6' : it.fx.toExponential(4)}
                        </td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">
                          {it.dfx !== undefined ? it.dfx.toFixed(4) : '—'}
                        </td>
                        <td className="py-2 px-4 text-right text-[var(--text-primary)]">
                          {it.error <= ERROR_FLOOR ? '< 1e-12' : it.error.toExponential(4)}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {isFinal ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-500">
                              <CheckCircle2 className="w-3 h-3" /> Converged
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)]">Iterating</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {activeTableTab === 'falsePosition' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border)] z-10 text-[var(--text-secondary)]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Step (k)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Lower a (min)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Upper b (min)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Secant Root c (min)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Residue g(c) [L]</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Step Error |Δx|</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                  {falsePosRes.iterations.map((it, idx) => {
                    const isFinal = idx === falsePosRes.iterations.length - 1 && falsePosRes.converged;
                    return (
                      <tr
                        key={it.iteration}
                        className={`transition-colors ${
                          isFinal
                            ? 'bg-cyan-500/10 font-bold border-l-4 border-cyan-500'
                            : idx % 2 === 0
                            ? 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]/60'
                            : 'bg-[var(--bg-elevated)]/25 hover:bg-[var(--bg-elevated)]/60'
                        }`}
                      >
                        <td className="py-2 px-4 text-[var(--text-secondary)]">{it.iteration}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">{it.a?.toFixed(4) ?? '—'}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">{it.b?.toFixed(4) ?? '—'}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-primary)]">{it.x.toFixed(4)}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">
                          {Math.abs(it.fx) < 1e-6 ? '< 1e-6' : it.fx.toExponential(4)}
                        </td>
                        <td className="py-2 px-4 text-right text-[var(--text-primary)]">
                          {it.error <= ERROR_FLOOR ? '< 1e-12' : it.error.toExponential(4)}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {isFinal ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-500">
                              <CheckCircle2 className="w-3 h-3" /> Converged
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)]">Iterating</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {activeTableTab === 'bisection' && (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--bg-elevated)] border-b border-[var(--border)] z-10 text-[var(--text-secondary)]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Step (k)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Lower a (min)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Upper b (min)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Midpoint c (min)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Residue g(c) [L]</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Step Error |Δx|</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] font-mono tabular-nums">
                  {bisectionRes.iterations.map((it, idx) => {
                    const isFinal = idx === bisectionRes.iterations.length - 1 && bisectionRes.converged;
                    return (
                      <tr
                        key={it.iteration}
                        className={`transition-colors ${
                          isFinal
                            ? 'bg-amber-500/10 font-bold border-l-4 border-amber-500'
                            : idx % 2 === 0
                            ? 'bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]/60'
                            : 'bg-[var(--bg-elevated)]/25 hover:bg-[var(--bg-elevated)]/60'
                        }`}
                      >
                        <td className="py-2 px-4 text-[var(--text-secondary)]">{it.iteration}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">{it.a?.toFixed(4) ?? '—'}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">{it.b?.toFixed(4) ?? '—'}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-primary)]">{it.x.toFixed(4)}</td>
                        <td className="py-2 px-4 text-right text-[var(--text-secondary)]">
                          {Math.abs(it.fx) < 1e-6 ? '< 1e-6' : it.fx.toExponential(4)}
                        </td>
                        <td className="py-2 px-4 text-right text-[var(--text-primary)]">
                          {it.error <= ERROR_FLOOR ? '< 1e-12' : it.error.toExponential(4)}
                        </td>
                        <td className="py-2 px-4 text-center">
                          {isFinal ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-500">
                              <CheckCircle2 className="w-3 h-3" /> Converged
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--text-muted)]">Iterating</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
