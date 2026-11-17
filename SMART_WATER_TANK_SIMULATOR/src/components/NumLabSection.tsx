import React, { useState, useMemo, useTransition } from 'react';
import {
  Calculator,
  Download,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
  Info,
  Play,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  BarChart2,
  LineChart as LineChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  ODEModelParams,
  ODEResult,
  RootFindingParams,
  RootFindingResult,
  LinearSystemResult,
} from '../types';
import {
  exportToCSV,
  formatExecTime,
  DEFAULT_MATRIX,
  solveEuler,
  solveModifiedEuler,
  solveRK4,
} from '../solvers';
import { soundFx } from '../utils/audio';
import { tokens } from '../designTokens';

interface NumLabSectionProps {
  odeParams: ODEModelParams;
  setOdeParams: React.Dispatch<React.SetStateAction<ODEModelParams>>;
  eulerRes: ODEResult;
  modEulerRes: ODEResult;
  rk4Res: ODEResult;
  rootInput: {
    targetVolume: number;
    lowerBound: number;
    upperBound: number;
    initialGuess: number;
    tolerance: number;
    maxIterations: number;
  };
  setRootInput: React.Dispatch<
    React.SetStateAction<{
      targetVolume: number;
      lowerBound: number;
      upperBound: number;
      initialGuess: number;
      tolerance: number;
      maxIterations: number;
    }>
  >;
  bisectionRes: RootFindingResult;
  falsePosRes: RootFindingResult;
  newtonRes: RootFindingResult;
  augMatrix: number[][];
  setAugMatrix: React.Dispatch<React.SetStateAction<number[][]>>;
  gaussRes: LinearSystemResult;
  gaussJordanRes: LinearSystemResult;
}

export const NumLabSectionComponent: React.FC<NumLabSectionProps> = ({
  odeParams,
  setOdeParams,
  eulerRes,
  modEulerRes,
  rk4Res,
  rootInput,
  setRootInput,
  bisectionRes,
  falsePosRes,
  newtonRes,
  augMatrix,
  setAugMatrix,
  gaussRes,
  gaussJordanRes,
}) => {
  const [tab, setTab] = useState<'ODE' | 'ROOT' | 'LINEAR'>('ODE');
  const [selectedRootMethod, setSelectedRootMethod] = useState<'BISECTION' | 'FALSE_POS' | 'NEWTON'>('NEWTON');

  // Form draft state with inline validation
  const [formParams, setFormParams] = useState<ODEModelParams>(odeParams);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  // Active chart view in Group A
  const [chartView, setChartView] = useState<'trajectory' | 'error' | 'convergence'>('trajectory');

  // Table Pagination
  const [tablePage, setTablePage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);

  // Input validation rules
  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (formParams.v0 < 0 || formParams.v0 > 5000) {
      errs.v0 = 'Initial volume must be between 0 and 5,000 L';
    }
    if (formParams.duration <= 0 || formParams.duration > 300) {
      errs.duration = 'Duration must be between 1 and 300 minutes';
    }
    if (formParams.stepSize <= 0.005 || formParams.stepSize > 10) {
      errs.stepSize = 'Step size must be between 0.01 and 10.0 min';
    }
    if (formParams.stepSize > formParams.duration) {
      errs.stepSize = 'Step size cannot exceed total duration';
    }
    if (formParams.qIn < 0 || formParams.qIn > 200) {
      errs.qIn = 'Inflow must be between 0 and 200 L/min';
    }
    if (formParams.qOut < 0 || formParams.qOut > 200) {
      errs.qOut = 'Drainage must be between 0 and 200 L/min';
    }
    return errs;
  }, [formParams]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  // Handle Run / Recalculate commit
  const handleRecalculate = () => {
    if (hasErrors) return;
    soundFx.playClick();
    setIsRecalculating(true);
    setTimeout(() => {
      startTransition(() => {
        setOdeParams(formParams);
        setTablePage(1);
        setIsRecalculating(false);
      });
    }, 180);
  };

  // Trajectory Chart Data (Sampled for rendering speed)
  const trajectoryChartData = useMemo(() => {
    const total = eulerRes.steps.length;
    const stride = total > 200 ? Math.ceil(total / 150) : 1;
    const data = [];
    for (let i = 0; i < total; i += stride) {
      const eStep = eulerRes.steps[i];
      const mStep = modEulerRes.steps[i];
      const rStep = rk4Res.steps[i];
      if (eStep) {
        data.push({
          time: Number(eStep.t.toFixed(2)),
          exact: Number(eStep.vExactRef.toFixed(3)),
          euler: Number(eStep.v.toFixed(3)),
          modEuler: Number(mStep?.v.toFixed(3) ?? eStep.v),
          rk4: Number(rStep?.v.toFixed(3) ?? eStep.v),
          eulerErr: Math.max(1e-9, eStep.absError),
          modEulerErr: Math.max(1e-9, mStep?.absError ?? 1e-9),
          rk4Err: Math.max(1e-9, rStep?.absError ?? 1e-9),
        });
      }
    }
    return data;
  }, [eulerRes, modEulerRes, rk4Res]);

  // Step-Size Convergence Comparison Data (h = 0.1, 0.25, 0.5, 1.0, 2.0)
  const convergenceData = useMemo(() => {
    const testHList = [0.1, 0.25, 0.5, 1.0, 2.0];
    return testHList.map((hVal) => {
      const p = { ...odeParams, stepSize: hVal };
      const e = solveEuler(p);
      const m = solveModifiedEuler(p);
      const r = solveRK4(p);
      return {
        h: `${hVal}m`,
        stepSizeNum: hVal,
        eulerError: Number(e.maxAbsError.toExponential(3)),
        eulerErrorNum: e.maxAbsError,
        modEulerError: Number(m.maxAbsError.toExponential(3)),
        modEulerErrorNum: m.maxAbsError,
        rk4Error: Number(r.maxAbsError.toExponential(3)),
        rk4ErrorNum: r.maxAbsError,
      };
    });
  }, [odeParams]);

  // Pagination slice for step table
  const totalSteps = eulerRes.steps.length;
  const totalPages = Math.ceil(totalSteps / rowsPerPage);
  const paginatedSteps = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return eulerRes.steps.slice(start, start + rowsPerPage);
  }, [eulerRes.steps, tablePage, rowsPerPage]);

  const handleExportODETable = () => {
    soundFx.playClick();
    const headers = [
      'Step',
      'Time_min',
      'Exact_Ref_L',
      'Euler_L',
      'Euler_AbsErr_L',
      'ModEuler_L',
      'ModEuler_AbsErr_L',
      'RK4_L',
      'RK4_AbsErr_L',
    ];
    const rows = eulerRes.steps.map((s, i) => [
      s.step,
      s.t.toFixed(4),
      s.vExactRef.toFixed(4),
      s.v.toFixed(4),
      s.absError.toExponential(4),
      modEulerRes.steps[i]?.v.toFixed(4) ?? '',
      modEulerRes.steps[i]?.absError.toExponential(4) ?? '',
      rk4Res.steps[i]?.v.toFixed(4) ?? '',
      rk4Res.steps[i]?.absError.toExponential(4) ?? '',
    ]);
    exportToCSV(`ode_solvers_table_h${odeParams.stepSize}_${Date.now()}`, headers, rows);
  };

  const handleExportRootTable = () => {
    soundFx.playClick();
    const res =
      selectedRootMethod === 'BISECTION'
        ? bisectionRes
        : selectedRootMethod === 'FALSE_POS'
        ? falsePosRes
        : newtonRes;

    const headers = ['Iteration', 'Lower_a', 'Upper_b', 'Estimate_x', 'f_x', 'Error'];
    const rows = res.iterations.map((it) => [
      it.iteration,
      it.a !== undefined ? it.a.toFixed(5) : '',
      it.b !== undefined ? it.b.toFixed(5) : '',
      it.x.toFixed(5),
      it.fx.toFixed(5),
      it.error.toExponential(4),
    ]);
    exportToCSV(`root_finding_${res.methodName.replace(/\s+/g, '_')}_${Date.now()}`, headers, rows);
  };

  // Find lowest error method to grant "Best Accuracy" badge
  const minError = Math.min(eulerRes.maxAbsError, modEulerRes.maxAbsError, rk4Res.maxAbsError);

  return (
    <div className="space-y-6">
      {/* =====================================================================
          1. GROUP TABS (Group A / B / C) with Keyboard Navigation & WCAG Focus
          ===================================================================== */}
      <div
        role="tablist"
        aria-label="Numerical Analysis Method Groups"
        className="p-1.5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 text-sm font-sans"
      >
        <div className="flex gap-1.5">
          {[
            { id: 'ODE' as const, label: 'Group A: ODE Solvers (3)', desc: 'Euler, Heun, RK4' },
            { id: 'ROOT' as const, label: 'Group B: Root-Finding (3)', desc: 'Bisection, False Pos, Newton' },
            { id: 'LINEAR' as const, label: 'Group C: Linear Systems (2)', desc: 'Gauss, Gauss-Jordan' },
          ].map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${t.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => {
                  soundFx.playClick();
                  setTab(t.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    if (t.id === 'ODE') setTab('ROOT');
                    else if (t.id === 'ROOT') setTab('LINEAR');
                  } else if (e.key === 'ArrowLeft') {
                    if (t.id === 'LINEAR') setTab('ROOT');
                    else if (t.id === 'ROOT') setTab('ODE');
                  }
                }}
                className={`px-4 py-2.5 rounded-lg font-semibold text-[13px] sm:text-[14px] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-bold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="text-[12px] text-slate-500 dark:text-slate-400 px-3 hidden sm:block">
          <span className="font-semibold text-blue-600 dark:text-blue-400">8 Numerical Methods</span> benchmarked head-to-head
        </div>
      </div>

      {/* =====================================================================
          GROUP A: ODE SOLVERS (Euler, Modified Euler/Heun, RK4)
          ===================================================================== */}
      {tab === 'ODE' && (
        <div id="panel-ODE" role="tabpanel" className="space-y-6 font-sans">
          {/* 1. PARAMETER CONFIGURATION PANEL */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-bold text-[17px] sm:text-[18px] text-slate-900 dark:text-white leading-[1.25] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  ODE Simulation Parameters
                </h2>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 leading-[1.5]">
                  Configure tank physics, initial fluid height, duration, and step-size increment
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 self-start sm:self-auto">
                <button
                  onClick={handleRecalculate}
                  disabled={hasErrors || isRecalculating}
                  className={`px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-2 shadow-xs transition focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
                    hasErrors || isRecalculating
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
                  }`}
                  aria-label="Run and recalculate numerical solvers"
                >
                  <Play className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
                  <span>{isRecalculating ? 'Computing...' : 'Run / Recalculate'}</span>
                </button>

                <button
                  onClick={handleExportODETable}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[13px] font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="Export ODE trajectory steps to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Parameter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm font-sans">
              {/* Physics Model */}
              <div className="space-y-1">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold text-[13px] tracking-[0.02em]">
                  Physics Model:
                </label>
                <select
                  value={formParams.model}
                  onChange={(e) => setFormParams((p) => ({ ...p, model: e.target.value as any }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-100 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="torricelli">Torricelli Non-Linear (k√V)</option>
                  <option value="linear">Linear Constant (Qin - Qout)</option>
                </select>
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block leading-[1.4]">
                  Non-linear orifice outflow velocity
                </span>
              </div>

              {/* Initial Volume V(0) */}
              <div className="space-y-1">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold text-[13px] tracking-[0.02em]">
                  Initial Volume V(0) [L]:
                </label>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  value={formParams.v0}
                  onChange={(e) => setFormParams((p) => ({ ...p, v0: Number(e.target.value) }))}
                  className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-lg p-2 font-mono tabular-nums text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    validationErrors.v0 ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                {validationErrors.v0 ? (
                  <span className="text-[12px] text-rose-600 dark:text-rose-400 block">{validationErrors.v0}</span>
                ) : (
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 block leading-[1.4]">Starting volume at t = 0 min</span>
                )}
              </div>

              {/* Duration T */}
              <div className="space-y-1">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold text-[13px] tracking-[0.02em]">
                  Duration T [min]:
                </label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={formParams.duration}
                  onChange={(e) => setFormParams((p) => ({ ...p, duration: Number(e.target.value) }))}
                  className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-lg p-2 font-mono tabular-nums text-[13px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    validationErrors.duration ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                {validationErrors.duration ? (
                  <span className="text-[12px] text-rose-600 dark:text-rose-400 block">{validationErrors.duration}</span>
                ) : (
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 block leading-[1.4]">Integration time horizon</span>
                )}
              </div>

              {/* Step Size h */}
              <div className="space-y-1">
                <label className="block text-slate-700 dark:text-slate-300 font-semibold text-[13px] tracking-[0.02em]">
                  Step Size h [min]:
                </label>
                <select
                  value={formParams.stepSize}
                  onChange={(e) => setFormParams((p) => ({ ...p, stepSize: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono font-bold text-[13px] tabular-nums text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="0.1">0.10 min (Ultra Fine)</option>
                  <option value="0.25">0.25 min (Fine)</option>
                  <option value="0.5">0.50 min (Moderate)</option>
                  <option value="1.0">1.00 min (Standard)</option>
                  <option value="2.0">2.00 min (Coarse)</option>
                  <option value="5.0">5.00 min (Very Coarse)</option>
                </select>
                <span className="text-[12px] text-slate-500 dark:text-slate-400 block leading-[1.4]">
                  Time step increment (Δt)
                </span>
              </div>
            </div>
          </div>

          {/* 2. SIDE-BY-SIDE METHOD RESULT CARDS (Euler / Heun / RK4) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
            {[
              {
                res: eulerRes,
                colorKey: 'euler' as const,
                accentColor: tokens.solvers.euler.color,
                badgeBg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
                borderHover: 'hover:border-amber-400 dark:hover:border-amber-600',
                orderDesc: 'Truncates Taylor series after 1st derivative. Local error O(h²), Global O(h).',
              },
              {
                res: modEulerRes,
                colorKey: 'modEuler' as const,
                accentColor: tokens.solvers.modEuler.color,
                badgeBg: 'bg-sky-100 text-sky-900 dark:bg-sky-950/70 dark:text-sky-300 border-sky-300 dark:border-sky-800',
                borderHover: 'hover:border-sky-400 dark:hover:border-sky-600',
                orderDesc: 'Predictor-corrector averages starting and ending tangents. Global error O(h²).',
              },
              {
                res: rk4Res,
                colorKey: 'rk4' as const,
                accentColor: tokens.solvers.rk4.color,
                badgeBg: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
                borderHover: 'hover:border-indigo-400 dark:hover:border-indigo-600',
                orderDesc: 'Simpson 1/6 weighting over 4 tangents eliminating 4 orders of error. Global O(h⁴).',
              },
            ].map(({ res, colorKey, accentColor, badgeBg, borderHover, orderDesc }) => {
              const isBest = res.maxAbsError === minError;
              const relAccuracyPercent = Math.max(
                0.01,
                Math.min(100, (1 - res.maxAbsError / Math.max(0.001, eulerRes.maxAbsError)) * 100)
              );

              return (
                <div
                  key={res.methodName}
                  className={`relative bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 transition-all duration-200 ${borderHover}`}
                >
                  {/* Top Bar: Method Name, Order Badge, & Best Accuracy Badge */}
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: accentColor }}
                          aria-hidden="true"
                        />
                        <h3 className="font-bold text-[15px] sm:text-[16px] text-slate-900 dark:text-white leading-[1.25]">
                          {res.methodName}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] sm:text-[12px] font-bold border tracking-wide ${badgeBg}`}
                          title={orderDesc}
                        >
                          {res.order}
                        </span>
                        {isBest && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] sm:text-[12px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <Sparkles className="w-3 h-3" />
                            Best Accuracy
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Main Metric Display: Final Volume */}
                  <div className="pt-1">
                    <span className="text-[13px] text-slate-500 dark:text-slate-400 font-medium block mb-0.5">
                      Final Volume V(T):
                    </span>
                    <div className="text-[34px] leading-[1.1] tracking-[-0.02em] font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {res.finalVolume.toFixed(4)}{' '}
                      <span className="text-[14px] font-medium font-sans text-slate-500 dark:text-slate-400">L</span>
                    </div>
                  </div>

                  {/* Precision Comparison Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[13px] font-medium text-slate-600 dark:text-slate-400">
                      <span>Precision Gain vs Baseline:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                        {colorKey === 'euler' ? 'Baseline (1x)' : `${relAccuracyPercent.toFixed(1)}%`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: colorKey === 'euler' ? '15%' : `${Math.max(15, relAccuracyPercent)}%`,
                          backgroundColor: accentColor,
                        }}
                      />
                    </div>
                  </div>

                  {/* Numerical Error & Telemetry Specs */}
                  <div className="space-y-2 text-[13px] pt-3 border-t border-slate-100 dark:border-slate-800/80 font-sans">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 font-normal tracking-[0.01em]">
                        Exact Ref V*(T):
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {res.refFinalVolume.toFixed(4)} L
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span
                        className="text-slate-600 dark:text-slate-400 flex items-center gap-1 cursor-help font-normal tracking-[0.01em]"
                        title="Maximum absolute error across all time steps: max |V_num - V_exact|"
                      >
                        Max Abs Error:
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                      </span>
                      <span className="font-mono font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {res.maxAbsError.toExponential(3)} L
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span
                        className="text-slate-600 dark:text-slate-400 flex items-center gap-1 cursor-help font-normal tracking-[0.01em]"
                        title="Mean relative percentage error: average (|V_num - V_exact| / V_exact) * 100%"
                      >
                        Mean Rel Error:
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                      </span>
                      <span className="font-mono text-slate-700 dark:text-slate-200 font-semibold tabular-nums">
                        {res.meanRelError < 1e-6 ? '< 1e-6 %' : `${res.meanRelError.toFixed(4)} %`}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-600 dark:text-slate-400 font-normal tracking-[0.01em]">Measured Exec Time:</span>
                      <span className="font-mono text-slate-700 dark:text-slate-200 font-medium tabular-nums">
                        {res.executionTimeMs.toFixed(3)} ms
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 3. INTERACTIVE DATA VISUALIZATION SECTION */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <LineChartIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Comparative Numerical Visualizations
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Analyze fluid trajectory, error propagation profiles, and step-size convergence rates
                </p>
              </div>

              {/* View Selector Tabs */}
              <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg text-xs font-semibold">
                <button
                  onClick={() => setChartView('trajectory')}
                  className={`px-3 py-1.5 rounded-md transition ${
                    chartView === 'trajectory'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  1. Trajectory V(t)
                </button>
                <button
                  onClick={() => setChartView('error')}
                  className={`px-3 py-1.5 rounded-md transition ${
                    chartView === 'error'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  2. Error Profile |Err(t)|
                </button>
                <button
                  onClick={() => setChartView('convergence')}
                  className={`px-3 py-1.5 rounded-md transition ${
                    chartView === 'convergence'
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  3. Convergence (h vs Error)
                </button>
              </div>
            </div>

            {/* View 1: Trajectory V(t) */}
            {chartView === 'trajectory' && (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trajectoryChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis
                      dataKey="time"
                      label={{ value: 'Time t [min]', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: '#64748b' }}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      label={{ value: 'Volume V [L]', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="p-3 bg-slate-900 text-white rounded-lg shadow-lg border border-slate-700 text-xs font-mono space-y-1">
                              <div className="text-slate-400 font-bold border-b border-slate-700 pb-1">
                                Time t = {d.time} min
                              </div>
                              <div className="text-emerald-400">Exact Ref: {d.exact} L</div>
                              <div className="text-amber-400">Euler: {d.euler} L</div>
                              <div className="text-sky-400">Heun: {d.modEuler} L</div>
                              <div className="text-indigo-400 font-bold">RK4: {d.rk4} L</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="exact"
                      name="Exact Reference (Analytical / Fine)"
                      stroke={tokens.solvers.exact.color}
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="euler"
                      name="Euler Method (O(h))"
                      stroke={tokens.solvers.euler.color}
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="modEuler"
                      name="Modified Euler / Heun (O(h²))"
                      stroke={tokens.solvers.modEuler.color}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rk4"
                      name="RK4 (O(h⁴))"
                      stroke={tokens.solvers.rk4.color}
                      strokeWidth={2.5}
                      strokeDasharray="4 2"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* View 2: Error Profile |Err(t)| */}
            {chartView === 'error' && (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trajectoryChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis
                      dataKey="time"
                      label={{ value: 'Time t [min]', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: '#64748b' }}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      label={{ value: 'Absolute Error |V - V*| [L]', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="p-3 bg-slate-900 text-white rounded-lg shadow-lg border border-slate-700 text-xs font-mono space-y-1">
                              <div className="text-slate-400 font-bold border-b border-slate-700 pb-1">
                                Time t = {d.time} min (Absolute Errors)
                              </div>
                              <div className="text-amber-400">Euler Error: {d.eulerErr.toExponential(4)} L</div>
                              <div className="text-sky-400">Heun Error: {d.modEulerErr.toExponential(4)} L</div>
                              <div className="text-indigo-400 font-bold">RK4 Error: {d.rk4Err.toExponential(4)} L</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="eulerErr"
                      name="Euler Absolute Error"
                      stroke={tokens.solvers.euler.color}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="modEulerErr"
                      name="Heun Absolute Error"
                      stroke={tokens.solvers.modEuler.color}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="rk4Err"
                      name="RK4 Absolute Error"
                      stroke={tokens.solvers.rk4.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* View 3: Step-Size Convergence Comparison */}
            {chartView === 'convergence' && (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={convergenceData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" />
                    <XAxis
                      dataKey="h"
                      label={{ value: 'Step Size h [min]', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: '#64748b' }}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      label={{ value: 'Max Truncation Error [L]', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="p-3 bg-slate-900 text-white rounded-lg shadow-lg border border-slate-700 text-xs font-mono space-y-1">
                              <div className="text-slate-400 font-bold border-b border-slate-700 pb-1">
                                Step Size h = {d.h}
                              </div>
                              <div className="text-amber-400">Euler Max Err: {d.eulerErrorNum.toExponential(3)} L</div>
                              <div className="text-sky-400">Heun Max Err: {d.modEulerErrorNum.toExponential(3)} L</div>
                              <div className="text-indigo-400 font-bold">RK4 Max Err: {d.rk4ErrorNum.toExponential(3)} L</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                    <Line
                      type="monotone"
                      dataKey="eulerErrorNum"
                      name="Euler O(h) Error"
                      stroke={tokens.solvers.euler.color}
                      strokeWidth={2}
                      strokeDasharray="2 2"
                    />
                    <Line
                      type="monotone"
                      dataKey="modEulerErrorNum"
                      name="Heun O(h²) Error"
                      stroke={tokens.solvers.modEuler.color}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="rk4ErrorNum"
                      name="RK4 O(h⁴) Error"
                      stroke={tokens.solvers.rk4.color}
                      strokeWidth={2.5}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 4. FULL STEP-BY-STEP NUMERICAL INTEGRATION TABLE */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-[17px] sm:text-[18px] text-slate-900 dark:text-white leading-[1.25]">
                  Step-by-Step Trajectory Trace (h = {odeParams.stepSize} min, {totalSteps} steps)
                </h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1 leading-[1.5]">
                  Full tabular verification with explicit time coordinates and error comparisons for all three methods
                </p>
              </div>

              {/* Table Controls: Pagination & CSV Download */}
              <div className="flex items-center gap-2">
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setTablePage(1);
                  }}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1 px-2 text-[12px] font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value={10}>10 rows/page</option>
                  <option value={25}>25 rows/page</option>
                  <option value={50}>50 rows/page</option>
                  <option value={100}>100 rows/page</option>
                </select>

                <button
                  onClick={handleExportODETable}
                  className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-[12px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Download Table CSV</span>
                </button>
              </div>
            </div>

            {/* Scrollable Table Container */}
            <div className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left font-mono text-[12px]">
                <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-xs text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-semibold tracking-wider text-[11px] uppercase font-sans">
                  <tr>
                    <th className="p-3 text-center">Step #</th>
                    <th className="p-3 text-right">Time t [min]</th>
                    <th className="p-3 text-right text-emerald-600 dark:text-emerald-400">Exact Ref V(t) [L]</th>
                    <th className="p-3 text-right text-amber-600 dark:text-amber-400">Euler V [L]</th>
                    <th className="p-3 text-right text-amber-600/80 dark:text-amber-400/80">Euler |Err| [L]</th>
                    <th className="p-3 text-right text-sky-600 dark:text-sky-400">Heun V [L]</th>
                    <th className="p-3 text-right text-sky-600/80 dark:text-sky-400/80">Heun |Err| [L]</th>
                    <th className="p-3 text-right text-indigo-600 dark:text-indigo-400 font-bold">RK4 V [L]</th>
                    <th className="p-3 text-right text-indigo-600/80 dark:text-indigo-400/80">RK4 |Err| [L]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {paginatedSteps.map((s, idx) => {
                    const globalIdx = (tablePage - 1) * rowsPerPage + idx;
                    const mStep = modEulerRes.steps[globalIdx];
                    const rStep = rk4Res.steps[globalIdx];

                    return (
                      <tr
                        key={s.step}
                        className="odd:bg-white even:bg-slate-50/50 dark:odd:bg-slate-900/40 dark:even:bg-slate-950/40 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
                      >
                        <td className="p-2.5 text-center text-slate-500 font-medium">{s.step}</td>
                        <td className="p-2.5 text-right font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                          {s.t.toFixed(2)}
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {s.vExactRef.toFixed(4)}
                        </td>
                        <td className="p-2.5 text-right text-amber-600 dark:text-amber-400 tabular-nums">
                          {s.v.toFixed(4)}
                        </td>
                        <td className="p-2.5 text-right text-amber-600/90 dark:text-amber-400/90 font-mono text-[12px] tabular-nums">
                          {s.absError.toExponential(2)}
                        </td>
                        <td className="p-2.5 text-right text-sky-600 dark:text-sky-400 tabular-nums">
                          {mStep?.v.toFixed(4) ?? '—'}
                        </td>
                        <td className="p-2.5 text-right text-sky-600/90 dark:text-sky-400/90 font-mono text-[12px] tabular-nums">
                          {mStep ? mStep.absError.toExponential(2) : '—'}
                        </td>
                        <td className="p-2.5 text-right font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                          {rStep?.v.toFixed(4) ?? '—'}
                        </td>
                        <td className="p-2.5 text-right text-indigo-600/90 dark:text-indigo-400/90 font-mono text-[12px] tabular-nums">
                          {rStep ? rStep.absError.toExponential(2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between text-[12px] text-slate-600 dark:text-slate-400 pt-2 font-sans">
              <div>
                Showing {(tablePage - 1) * rowsPerPage + 1}–
                {Math.min(tablePage * rowsPerPage, totalSteps)} of {totalSteps} steps
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                  disabled={tablePage === 1}
                  className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Page {tablePage} of {totalPages}
                </span>
                <button
                  onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                  disabled={tablePage === totalPages}
                  className="p-1.5 rounded-md border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          GROUP B: ROOT-FINDING SOLVERS
          ========================================================================= */}
      {tab === 'ROOT' && (
        <div id="panel-ROOT" role="tabpanel" className="space-y-6 font-sans">
          {/* Root Search Parameters */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 text-[13px] font-sans">
            <h3 className="font-semibold text-[17px] sm:text-[18px] text-slate-900 dark:text-white leading-[1.25] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" /> Root-Finding Horizon Parameters (g(t) = V(t) - V_tgt = 0)
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 font-sans">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold text-[13px] tracking-[0.02em]">Target Volume [L]:</label>
                <input
                  type="number"
                  value={rootInput.targetVolume}
                  onChange={(e) => setRootInput((p) => ({ ...p, targetVolume: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-blue-600 dark:text-blue-400 font-bold font-mono tabular-nums text-[13px]"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold text-[13px] tracking-[0.02em]">Bracket Lower [a]:</label>
                <input
                  type="number"
                  value={rootInput.lowerBound}
                  onChange={(e) => setRootInput((p) => ({ ...p, lowerBound: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-200 font-mono tabular-nums text-[13px]"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold text-[13px] tracking-[0.02em]">Bracket Upper [b]:</label>
                <input
                  type="number"
                  value={rootInput.upperBound}
                  onChange={(e) => setRootInput((p) => ({ ...p, upperBound: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-200 font-mono tabular-nums text-[13px]"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold text-[13px] tracking-[0.02em]">Newton Guess t₀:</label>
                <input
                  type="number"
                  value={rootInput.initialGuess}
                  onChange={(e) => setRootInput((p) => ({ ...p, initialGuess: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-200 font-mono tabular-nums text-[13px]"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1 font-semibold text-[13px] tracking-[0.02em]">Tolerance (ε):</label>
                <select
                  value={rootInput.tolerance}
                  onChange={(e) => setRootInput((p) => ({ ...p, tolerance: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-slate-200 font-mono tabular-nums text-[13px] cursor-pointer"
                >
                  <option value="0.001">10⁻³ (0.001)</option>
                  <option value="0.0001">10⁻⁴ (0.0001 Standard)</option>
                  <option value="0.000001">10⁻⁶ (1e-6 High)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleExportRootTable}
                  className="w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-blue-600 dark:text-blue-400 font-semibold text-[13px] flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* 3 Solver Result Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
            {[
              { res: bisectionRes, key: 'BISECTION' as const, rate: 'Linear: ε_k+1 = 0.5 ε_k' },
              { res: falsePosRes, key: 'FALSE_POS' as const, rate: 'Superlinear / Secant' },
              { res: newtonRes, key: 'NEWTON' as const, rate: 'Quadratic: ε_k+1 ≈ C·ε_k²' },
            ].map(({ res, key, rate }) => (
              <div
                key={res.methodName}
                onClick={() => {
                  soundFx.playClick();
                  setSelectedRootMethod(key);
                }}
                className={`bg-white dark:bg-[#0f172a] rounded-xl border p-6 shadow-xs space-y-3 cursor-pointer transition ${
                  selectedRootMethod === key
                    ? 'border-blue-600 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[15px] sm:text-[16px] text-slate-900 dark:text-white leading-[1.25]">{res.methodName}</span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                      res.converged
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {res.converged ? 'Converged' : 'Failed'}
                  </span>
                </div>

                <div className="text-[34px] leading-[1.1] tracking-[-0.02em] font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {res.root !== null ? (
                    <>
                      {res.root.toFixed(4)}{' '}
                      <span className="text-[14px] font-medium font-sans text-slate-500 dark:text-slate-400">min</span>
                    </>
                  ) : 'N/A'}
                </div>

                <div className="space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-normal">Iterations:</span>
                    <span className="font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">{res.iterations.length} steps</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-normal">Convergence Rate:</span>
                    <span className="text-slate-700 dark:text-slate-200 font-medium">{rate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-normal">Execution Time:</span>
                    <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">{formatExecTime(res.executionTimeMs)}</span>
                  </div>
                </div>

                <p className="text-[12px] text-slate-500 dark:text-slate-400 italic pt-1 leading-[1.4]">{res.statusMessage}</p>
              </div>
            ))}
          </div>

          {/* Iteration Detail Table for Selected Root Method */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 font-sans">
            <div className="flex justify-between items-center text-[13px]">
              <span className="font-semibold text-[15px] sm:text-[16px] text-slate-900 dark:text-white leading-[1.25]">
                Iteration Log:{' '}
                {selectedRootMethod === 'BISECTION'
                  ? 'Bisection Method'
                  : selectedRootMethod === 'FALSE_POS'
                  ? 'False Position (Regula Falsi)'
                  : 'Newton-Raphson Method'}
              </span>
              <span className="text-blue-600 dark:text-blue-400 font-medium font-mono tabular-nums text-[12px]">
                Target: {rootInput.targetVolume} L | Tolerance: {rootInput.tolerance}
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left font-mono text-[12px]">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 sticky top-0 border-b border-slate-200 dark:border-slate-700 font-sans">
                  <tr>
                    <th className="p-3">Iter</th>
                    {selectedRootMethod !== 'NEWTON' && <th className="p-3">a (Lower)</th>}
                    {selectedRootMethod !== 'NEWTON' && <th className="p-3">b (Upper)</th>}
                    <th className="p-3 text-blue-600 dark:text-blue-400">Root Estimate x (min)</th>
                    <th className="p-3 text-amber-600 dark:text-amber-400">g(x) = V(x) - V_tgt</th>
                    {selectedRootMethod === 'NEWTON' && <th className="p-3 text-emerald-600 dark:text-emerald-400">g'(x) = dV/dt</th>}
                    <th className="p-3 text-slate-500">Error |Δx|</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {(selectedRootMethod === 'BISECTION'
                    ? bisectionRes.iterations
                    : selectedRootMethod === 'FALSE_POS'
                    ? falsePosRes.iterations
                    : newtonRes.iterations
                  ).map((it) => (
                    <tr key={it.iteration} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="p-2.5 font-bold text-slate-500">{it.iteration}</td>
                      {selectedRootMethod !== 'NEWTON' && <td className="p-2.5">{it.a?.toFixed(4)}</td>}
                      {selectedRootMethod !== 'NEWTON' && <td className="p-2.5">{it.b?.toFixed(4)}</td>}
                      <td className="p-2.5 font-bold text-blue-600 dark:text-blue-400">{it.x.toFixed(5)}</td>
                      <td className="p-2.5 text-amber-600 dark:text-amber-400">{it.fx.toFixed(5)}</td>
                      {selectedRootMethod === 'NEWTON' && (
                        <td className="p-2.5 text-emerald-600 dark:text-emerald-400">{it.dfx?.toFixed(4)}</td>
                      )}
                      <td className="p-2.5 text-slate-400 font-mono text-[11px]">{it.error.toExponential(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          GROUP C: LINEAR SYSTEM SOLVERS
          ========================================================================= */}
      {tab === 'LINEAR' && (
        <div id="panel-LINEAR" role="tabpanel" className="space-y-6 font-sans">
          {/* Augmented Matrix Editor */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4 text-[13px] font-sans">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-[17px] sm:text-[18px] text-slate-900 dark:text-white leading-[1.25] flex items-center gap-2">
                <Calculator className="w-4 h-4 text-blue-600" /> 3x4 Augmented Matrix Editor [A | b]
              </h3>
              <button
                onClick={() => {
                  soundFx.playClick();
                  setAugMatrix(DEFAULT_MATRIX);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 font-semibold text-[12px] flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Standard Matrix</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[0, 1, 2].map((r) => (
                <div key={r} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-slate-700 dark:text-slate-300 font-semibold text-[13px]">
                    Row {r + 1}: Pipe Equation {r + 1}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((c) => (
                      <div key={c}>
                        <label className="text-[12px] text-slate-500 font-semibold">
                          {c === 0 ? 'x' : c === 1 ? 'y' : c === 2 ? 'z' : 'b'}
                        </label>
                        <input
                          type="number"
                          value={augMatrix[r][c]}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setAugMatrix((prev) => {
                              const nxt = prev.map((row) => [...row]);
                              nxt[r][c] = val;
                              return nxt;
                            });
                          }}
                          className={`w-full bg-white dark:bg-slate-950 border rounded-lg p-1.5 text-center font-bold font-mono tabular-nums text-[13px] ${
                            c === 3 ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-200'
                          }`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Solver Result Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
            {[gaussRes, gaussJordanRes].map((sol) => (
              <div
                key={sol.methodName}
                className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[15px] sm:text-[16px] text-slate-900 dark:text-white leading-[1.25]">{sol.methodName}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-[11px] sm:text-[12px] font-semibold ${
                      sol.status === 'UNIQUE'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {sol.status}
                  </span>
                </div>

                {sol.solution ? (
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <span className="text-[13px] text-slate-500 dark:text-slate-400 font-medium">Discharge Solution (L/min):</span>
                    <div className="grid grid-cols-3 gap-3 mt-2 text-center">
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-950 border border-blue-200 dark:border-blue-900/60 shadow-xs">
                        <span className="text-[11px] font-bold text-slate-500">Pipe A (x)</span>
                        <div className="text-[18px] sm:text-[20px] font-bold font-mono tabular-nums text-blue-600 dark:text-blue-400">{sol.solution[0].toFixed(2)} L/m</div>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-900/60 shadow-xs">
                        <span className="text-[11px] font-bold text-slate-500">Pipe B (y)</span>
                        <div className="text-[18px] sm:text-[20px] font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{sol.solution[1].toFixed(2)} L/m</div>
                      </div>
                      <div className="p-3 rounded-lg bg-white dark:bg-slate-950 border border-sky-200 dark:border-sky-900/60 shadow-xs">
                        <span className="text-[11px] font-bold text-slate-500">Pipe C (z)</span>
                        <div className="text-[18px] sm:text-[20px] font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">{sol.solution[2].toFixed(2)} L/m</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[12px]">
                    {sol.statusMessage}
                  </div>
                )}

                <div className="space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-normal">Max Residual ||Ax - b||:</span>
                    <span className="font-semibold font-mono tabular-nums text-amber-600 dark:text-amber-400">{sol.maxResidualError.toExponential(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-normal">Row Operations:</span>
                    <span className="text-slate-700 dark:text-slate-200 font-medium font-mono tabular-nums">{sol.steps.length - 1} steps</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-normal">Execution Time:</span>
                    <span className="text-slate-700 dark:text-slate-200 font-mono tabular-nums">{formatExecTime(sol.executionTimeMs)}</span>
                  </div>
                </div>

                {/* Step-by-step matrix steps preview */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 max-h-56 overflow-y-auto">
                  {sol.steps.map((st) => (
                    <div key={st.stepIndex} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[12px] font-mono">
                      <div className="text-blue-600 dark:text-blue-400 font-bold tabular-nums">
                        Step {st.stepIndex}: {st.operationCode}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 text-[12px] font-sans mt-0.5 leading-[1.4]">{st.explanation}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const NumLabSection = React.memo(NumLabSectionComponent);
