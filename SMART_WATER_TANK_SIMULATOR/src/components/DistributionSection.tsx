import React, { useState, useMemo, useEffect } from 'react';
import {
  GitBranch,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Download,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Cpu,
  Layers,
  Scale,
  Sparkles,
} from 'lucide-react';
import { LinearSystemResult, MatrixStep } from '../types';
import { solveGaussianElimination, solveGaussJordan, exportToCSV } from '../solvers';
import {
  computeDeterminant3x3,
  computeConditionNumber1,
  validateFlowFeasibility,
} from '../matrixUtils';
import { METHOD_IDENTITIES, formatFlowRate } from '../sharedFormatters';
import { soundFx } from '../utils/audio';

interface DistributionSectionProps {
  augMatrix?: number[][];
  setAugMatrix?: React.Dispatch<React.SetStateAction<number[][]>>;
}

export const DistributionSection: React.FC<DistributionSectionProps> = () => {
  // Hydraulic parameters
  const [totalOutflow, setTotalOutflow] = useState<number>(8);
  const [diffPipeAB, setDiffPipeAB] = useState<number>(1);
  const [ratioBC, setRatioBC] = useState<number>(3);

  // Stepper state for Gaussian vs Gauss-Jordan
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeMethodTab, setActiveMethodTab] = useState<'gaussian' | 'gaussJordan' | 'sideBySide'>('sideBySide');

  // Tooltip state
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // 3x4 Augmented Matrix:
  // Eq1:  x +  y +  z = Q_out
  // Eq2:  x -  y +  0 = diff (Flow difference: Zone 1 - Zone 2)
  // Eq3:  0 +  y - r*z = 0   (Manifold ratio: y = r*z)
  const currentMatrix: number[][] = useMemo(() => {
    return [
      [1, 1, 1, totalOutflow],
      [1, -1, 0, diffPipeAB],
      [0, 1, -ratioBC, 0],
    ];
  }, [totalOutflow, diffPipeAB, ratioBC]);

  // Exact 3x3 determinant: det(A) = 2r + 1 (for r=3, det=7)
  const exactDet = useMemo(() => {
    return computeDeterminant3x3(currentMatrix.map((r) => r.slice(0, 3)));
  }, [currentMatrix]);

  // Exact condition number κ₁ = ||A||₁ · ||A⁻¹||₁
  const conditionNumberInfo = useMemo(() => {
    return computeConditionNumber1(currentMatrix.map((r) => r.slice(0, 3)));
  }, [currentMatrix]);

  // Solve linear systems via Gaussian Elimination and Gauss-Jordan
  const gaussRes = useMemo(() => solveGaussianElimination(currentMatrix), [currentMatrix]);
  const gaussJordanRes = useMemo(() => solveGaussJordan(currentMatrix), [currentMatrix]);

  // Extract solutions: x = qA, y = qB, z = qC
  const qA = gaussRes.solution ? gaussRes.solution[0] : 0;
  const qB = gaussRes.solution ? gaussRes.solution[1] : 0;
  const qC = gaussRes.solution ? gaussRes.solution[2] : 0;
  const sumFlow = qA + qB + qC;

  // Percentage distribution
  const pctA = sumFlow > 0 && qA > 0 ? (qA / sumFlow) * 100 : 0;
  const pctB = sumFlow > 0 && qB > 0 ? (qB / sumFlow) * 100 : 0;
  const pctC = sumFlow > 0 && qC > 0 ? (qC / sumFlow) * 100 : 0;

  // Feasibility validation
  const feasibility = useMemo(() => {
    return validateFlowFeasibility(qA, qB, qC, totalOutflow);
  }, [qA, qB, qC, totalOutflow]);

  // Max steps between the two solvers
  const maxSteps = Math.max(gaussRes.steps.length, gaussJordanRes.steps.length);

  // Stepper Autoplay effect
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= maxSteps - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1800);
    return () => clearInterval(interval);
  }, [isPlaying, maxSteps]);

  // Reset to default textbook parameters: Q=8, d=1, r=3 -> x=4, y=3, z=1
  const handleResetDefault = () => {
    soundFx.playClick();
    setTotalOutflow(8);
    setDiffPipeAB(1);
    setRatioBC(3);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  // Export steps to CSV
  const handleExportSteps = () => {
    soundFx.playClick();
    const headers = ['Method', 'Step', 'Operation', 'Explanation', 'Row1', 'Row2', 'Row3', 'RHS_b'];
    const rows = [
      ...gaussRes.steps.map((st) => [
        'Gaussian Elimination',
        st.stepIndex,
        st.operationCode,
        st.explanation,
        st.matrix[0].slice(0, 3).join(' '),
        st.matrix[1].slice(0, 3).join(' '),
        st.matrix[2].slice(0, 3).join(' '),
        st.matrix.map((r) => r[3]).join(' '),
      ]),
      ...gaussJordanRes.steps.map((st) => [
        'Gauss-Jordan',
        st.stepIndex,
        st.operationCode,
        st.explanation,
        st.matrix[0].slice(0, 3).join(' '),
        st.matrix[1].slice(0, 3).join(' '),
        st.matrix[2].slice(0, 3).join(' '),
        st.matrix.map((r) => r[3]).join(' '),
      ]),
    ];
    exportToCSV(`hydraulic_manifold_matrix_steps_${Date.now()}`, headers, rows);
  };

  // Both methods agreement check (|x_GE - x_GJ| < 1e-9)
  const methodsAgree = useMemo(() => {
    if (!gaussRes.solution || !gaussJordanRes.solution) return false;
    const diffX = Math.abs(gaussRes.solution[0] - gaussJordanRes.solution[0]);
    const diffY = Math.abs(gaussRes.solution[1] - gaussJordanRes.solution[1]);
    const diffZ = Math.abs(gaussRes.solution[2] - gaussJordanRes.solution[2]);
    return Math.max(diffX, diffY, diffZ) < 1e-9;
  }, [gaussRes, gaussJordanRes]);

  // Render an augmented matrix with brackets, vertical bar before b, and pivot highlight
  const renderAugmentedMatrix = (step: MatrixStep | undefined, method: 'GE' | 'GJ') => {
    if (!step) {
      return (
        <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
          No step data available.
        </div>
      );
    }

    return (
      <div className="p-4 rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border)] space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
          <span className="font-bold text-[var(--accent)] text-xs">
            Step {step.stepIndex}: {step.operationCode}
          </span>
          <span className="text-[10px] text-[var(--text-muted)] font-sans">
            {method === 'GE' ? 'Triangular Form' : 'Reduced Row Echelon (RREF)'}
          </span>
        </div>

        <p className="text-[11px] text-[var(--text-secondary)] font-sans">
          {step.explanation}
        </p>

        {/* Augmented Matrix Grid with [A | b] styling */}
        <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-inner">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl font-light text-[var(--text-muted)] select-none">[</span>
            <div className="space-y-1.5 tabular-nums">
              {step.matrix.map((row, rIdx) => (
                <div key={rIdx} className="flex items-center gap-3">
                  {/* Matrix A (3 columns) */}
                  <div className="flex items-center gap-3 text-right">
                    {row.slice(0, 3).map((val, cIdx) => {
                      const isDiagonal = rIdx === cIdx;
                      return (
                        <span
                          key={cIdx}
                          className={`w-12 py-0.5 px-1 rounded text-right transition-colors ${
                            isDiagonal
                              ? 'font-bold text-[var(--text-primary)] bg-[var(--accent)]/10'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {val.toFixed(2)}
                        </span>
                      );
                    })}
                  </div>

                  {/* Vertical Separator Bar | */}
                  <div className="w-[1px] h-4 bg-[var(--border-strong)]" />

                  {/* Vector b (Right Hand Side) */}
                  <span className="w-14 font-bold text-right text-[var(--accent)]">
                    {row[3].toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-xl font-light text-[var(--text-muted)] select-none">]</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Hydraulic Schematic & Live Parameters */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive Manifold SVG Diagram */}
        <div className="lg:col-span-7 card-surface rounded-xl border border-[var(--border)] p-5 sm:p-6 shadow-md flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
            <span className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-[var(--accent)]" /> Multi-Pipe Hydraulic Distribution Manifold
            </span>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                feasibility.isFeasible
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/30'
              }`}>
                {feasibility.isFeasible ? 'Hydraulically Balanced' : 'Flow Infeasible'}
              </span>
            </div>
          </div>

          {/* Feasibility Alert Banner if backflow detected */}
          {feasibility.warningMessage && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{feasibility.warningMessage}</span>
            </div>
          )}

          {/* SVG Schematic Diagram */}
          <div className="w-full flex items-center justify-center py-2">
            <svg
              viewBox="0 0 560 210"
              className="w-full max-w-[540px] h-auto drop-shadow-md select-none overflow-visible"
              aria-label="Hydraulic manifold pipe distribution diagram"
            >
              <defs>
                <linearGradient id="trunkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#0284c7" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>

              {/* Tank Outlet Block */}
              <rect
                x="8"
                y="75"
                width="84"
                height="60"
                rx="8"
                fill="var(--bg-elevated)"
                stroke="var(--border-strong)"
                strokeWidth="2"
              />
              <text x="50" y="100" textAnchor="middle" className="text-[11px] font-mono fill-[var(--text-primary)] font-bold">
                TANK OUTLET
              </text>
              <text x="50" y="118" textAnchor="middle" className="text-[10px] font-mono fill-[var(--accent)] font-semibold">
                {totalOutflow} L/min
              </text>

              {/* Main Trunk Pipe */}
              <line
                x1="92"
                y1="105"
                x2="175"
                y2="105"
                stroke="url(#trunkGrad)"
                strokeWidth="12"
                strokeLinecap="round"
              />
              <line
                x1="92"
                y1="105"
                x2="175"
                y2="105"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeOpacity="0.8"
                className="animate-pipe-flow"
              />

              {/* Central Manifold Node */}
              <circle
                cx="175"
                cy="105"
                r="16"
                fill="var(--bg-surface)"
                stroke="var(--accent)"
                strokeWidth="3.5"
              />
              <text x="175" y="109" textAnchor="middle" className="text-[9px] font-mono fill-[var(--text-primary)] font-bold">
                MANIFOLD
              </text>

              {/* Branch 1 to Pipe A (Blue) */}
              <path
                d="M 175 105 L 245 42 L 390 42"
                fill="none"
                stroke={METHOD_IDENTITIES.pipeA.color}
                strokeWidth={feasibility.clampedStrokeWidths.pipeA}
                strokeLinecap="round"
              />
              <path
                d="M 175 105 L 245 42 L 390 42"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeOpacity="0.75"
                className="animate-pipe-flow"
              />

              {/* Branch 2 to Pipe B (Green) */}
              <line
                x1="175"
                y1="105"
                x2="390"
                y2="105"
                stroke={METHOD_IDENTITIES.pipeB.color}
                strokeWidth={feasibility.clampedStrokeWidths.pipeB}
                strokeLinecap="round"
              />
              <line
                x1="175"
                y1="105"
                x2="390"
                y2="105"
                stroke="#ffffff"
                strokeWidth="2"
                strokeOpacity="0.75"
                className="animate-pipe-flow"
              />

              {/* Branch 3 to Pipe C (Amber) */}
              <path
                d="M 175 105 L 245 168 L 390 168"
                fill="none"
                stroke={METHOD_IDENTITIES.pipeC.color}
                strokeWidth={feasibility.clampedStrokeWidths.pipeC}
                strokeLinecap="round"
              />
              <path
                d="M 175 105 L 245 168 L 390 168"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeOpacity="0.75"
                className="animate-pipe-flow"
              />

              {/* Terminal Box: Pipe A */}
              <g transform="translate(390, 18)">
                <rect
                  x="0"
                  y="0"
                  width="155"
                  height="48"
                  rx="8"
                  fill="var(--bg-elevated)"
                  stroke={METHOD_IDENTITIES.pipeA.color}
                  strokeWidth="1.5"
                />
                <text x="10" y="20" className="text-[11px] font-sans fill-[#3b82f6] font-bold">
                  PIPE A (Zone 1) [x]
                </text>
                <text x="10" y="38" className="text-xs font-mono fill-[var(--text-primary)] font-bold">
                  {formatFlowRate(qA)} ({pctA.toFixed(1)}%)
                </text>
              </g>

              {/* Terminal Box: Pipe B */}
              <g transform="translate(390, 81)">
                <rect
                  x="0"
                  y="0"
                  width="155"
                  height="48"
                  rx="8"
                  fill="var(--bg-elevated)"
                  stroke={METHOD_IDENTITIES.pipeB.color}
                  strokeWidth="1.5"
                />
                <text x="10" y="20" className="text-[11px] font-sans fill-[#10b981] font-bold">
                  PIPE B (Zone 2) [y]
                </text>
                <text x="10" y="38" className="text-xs font-mono fill-[var(--text-primary)] font-bold">
                  {formatFlowRate(qB)} ({pctB.toFixed(1)}%)
                </text>
              </g>

              {/* Terminal Box: Pipe C */}
              <g transform="translate(390, 144)">
                <rect
                  x="0"
                  y="0"
                  width="155"
                  height="48"
                  rx="8"
                  fill="var(--bg-elevated)"
                  stroke={METHOD_IDENTITIES.pipeC.color}
                  strokeWidth="1.5"
                />
                <text x="10" y="20" className="text-[11px] font-sans fill-[#f59e0b] font-bold">
                  PIPE C (Zone 3) [z]
                </text>
                <text x="10" y="38" className="text-xs font-mono fill-[var(--text-primary)] font-bold">
                  {formatFlowRate(qC)} ({pctC.toFixed(1)}%)
                </text>
              </g>
            </svg>
          </div>

          {/* Compact Results Strip with % Share Bars */}
          <div className="space-y-2 pt-2 border-t border-[var(--border)]">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-semibold text-[#3b82f6]">Pipe A</span>
                  <span className="font-mono text-[var(--text-primary)]">{qA.toFixed(2)} L/min</span>
                </div>
                <div className="w-full bg-[var(--bg-surface)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#3b82f6] rounded-full transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, pctA))}%` }}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-semibold text-[#10b981]">Pipe B</span>
                  <span className="font-mono text-[var(--text-primary)]">{qB.toFixed(2)} L/min</span>
                </div>
                <div className="w-full bg-[var(--bg-surface)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#10b981] rounded-full transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, pctB))}%` }}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] space-y-1">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="font-semibold text-[#f59e0b]">Pipe C</span>
                  <span className="font-mono text-[var(--text-primary)]">{qC.toFixed(2)} L/min</span>
                </div>
                <div className="w-full bg-[var(--bg-surface)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#f59e0b] rounded-full transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, pctC))}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Total Discharge Balance Row with Residual Badge */}
            <div className="p-3 rounded-lg bg-[var(--bg-elevated)]/60 border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-[var(--text-secondary)] font-medium">Total Discharge Balance:</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  {qA.toFixed(2)} + {qB.toFixed(2)} + {qC.toFixed(2)} = {sumFlow.toFixed(2)} L/min
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                  title="Residual ||Ax - b|| = 0 L/min within machine precision"
                >
                  Residual: {gaussRes.maxResidualError < 1e-12 ? '0 L/min' : gaussRes.maxResidualError.toExponential(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Parameter Controls & Live Equations */}
        <div className="lg:col-span-5 card-surface rounded-xl border border-[var(--border)] p-5 sm:p-6 shadow-md space-y-4 text-xs">
          <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
            <span className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[var(--accent)]" /> Flow Parameters &amp; Constraints
            </span>
            <button
              onClick={handleResetDefault}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium text-xs flex items-center gap-1 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
          </div>

          {/* Governing Linear System with Color-Coded Variables */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-wide uppercase">
                Governing 3x3 Linear System:
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">A · x = b</span>
            </div>

            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Eq 1 (Total Mass Balance):</span>
                <span className="font-bold">
                  <span className="text-[#3b82f6]">x</span> + <span className="text-[#10b981]">y</span> + <span className="text-[#f59e0b]">z</span> = {totalOutflow} L/min
                </span>
              </div>

              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Eq 2 (Flow Difference):</span>
                <span className="font-bold">
                  <span className="text-[#3b82f6]">x</span> − <span className="text-[#10b981]">y</span> = {diffPipeAB} L/min
                </span>
              </div>

              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] flex justify-between items-center">
                <span className="text-[var(--text-secondary)]">Eq 3 (Branch Ratio):</span>
                <span className="font-bold">
                  <span className="text-[#10b981]">y</span> − {ratioBC}<span className="text-[#f59e0b]">z</span> = 0
                </span>
              </div>
            </div>
          </div>

          {/* Sliders with Numeric Inputs beside them */}
          <div className="space-y-4 pt-1">
            {/* Slider 1: Total Outflow Q_out */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[var(--text-secondary)] font-medium">
                  Total Drainage Q_out (L/min):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={2}
                    max={40}
                    step={1}
                    value={totalOutflow}
                    onChange={(e) => setTotalOutflow(Math.max(1, Number(e.target.value)))}
                    className="w-16 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-elevated)] text-right font-mono font-bold text-xs text-[var(--accent)]"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">L/min</span>
                </div>
              </div>
              <input
                type="range"
                min={2}
                max={30}
                step={1}
                value={totalOutflow}
                onChange={(e) => setTotalOutflow(Number(e.target.value))}
                aria-label="Total Drainage Outflow in Liters per minute"
                aria-valuetext={`${totalOutflow} L/min`}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((totalOutflow - 2) / (30 - 2)) * 100}%, var(--bg-elevated) ${((totalOutflow - 2) / (30 - 2)) * 100}%, var(--bg-elevated) 100%)`,
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                <span>2 L/min</span>
                <span>30 L/min</span>
              </div>
            </div>

            {/* Slider 2: Flow Difference (Zone 1 - Zone 2) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[var(--text-secondary)] font-medium">
                  Flow Difference (Zone 1 − Zone 2):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    value={diffPipeAB}
                    onChange={(e) => setDiffPipeAB(Math.max(0, Number(e.target.value)))}
                    className="w-16 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-elevated)] text-right font-mono font-bold text-xs text-[var(--accent)]"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">L/min</span>
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={diffPipeAB}
                onChange={(e) => setDiffPipeAB(Number(e.target.value))}
                aria-label="Flow difference between Zone 1 and Zone 2 in Liters per minute"
                aria-valuetext={`${diffPipeAB} L/min`}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(diffPipeAB / 10) * 100}%, var(--bg-elevated) ${(diffPipeAB / 10) * 100}%, var(--bg-elevated) 100%)`,
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                <span>0 L/min</span>
                <span>10 L/min</span>
              </div>
            </div>

            {/* Slider 3: Branch Ratio y/z */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[var(--text-secondary)] font-medium">
                  Manifold Flow Ratio (y / z):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={ratioBC}
                    onChange={(e) => setRatioBC(Math.max(1, Number(e.target.value)))}
                    className="w-16 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-elevated)] text-right font-mono font-bold text-xs text-[var(--accent)]"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">ratio</span>
                </div>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={ratioBC}
                onChange={(e) => setRatioBC(Number(e.target.value))}
                aria-label="Manifold ratio y over z"
                aria-valuetext={`${ratioBC} to 1`}
                style={{
                  background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((ratioBC - 1) / (5 - 1)) * 100}%, var(--bg-elevated) ${((ratioBC - 1) / (5 - 1)) * 100}%, var(--bg-elevated) 100%)`,
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)] font-mono">
                <span>1x (Equal split)</span>
                <span>5x (High restriction)</span>
              </div>
            </div>
          </div>

          {/* Condition Number & Determinant Block */}
          <div className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--text-secondary)] font-medium">Matrix Determinant det(A):</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  det(A) = 2r + 1 = {exactDet}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-500 font-mono">Non-Singular (≠ 0)</span>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]/50">
              <div className="flex items-center gap-1">
                <span className="text-[var(--text-secondary)] font-medium">Condition Number κ₁(A):</span>
                <button
                  type="button"
                  onClick={() => setActiveTooltip(activeTooltip === 'cond' ? null : 'cond')}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                  title="Condition number details"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs border ${conditionNumberInfo.badgeColor}`}>
                κ₁ ≈ {conditionNumberInfo.kappa1.toFixed(2)} ({conditionNumberInfo.category})
              </span>
            </div>

            {activeTooltip === 'cond' && (
              <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-[11px] text-[var(--text-secondary)] shadow-lg space-y-1">
                <div className="font-semibold text-[var(--text-primary)]">1-Norm Condition Number κ₁(A) = ||A||₁ · ||A⁻¹||₁:</div>
                <p>• κ₁ &lt; 10: Well-conditioned (errors are damped)</p>
                <p>• 10 ≤ κ₁ ≤ 100: Moderately conditioned</p>
                <p>• κ₁ &gt; 100: Ill-conditioned (extreme error magnification)</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Synchronized Stepper: Gaussian Elimination vs Gauss-Jordan Reduction */}
      <div className="card-surface rounded-xl border border-[var(--border)] p-5 sm:p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--border)]">
          <div>
            <h4 className="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <Cpu className="w-4 h-4 text-[var(--accent)]" /> Synchronized Row Elimination Stepper
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Inspect step-by-step matrix row operations for Forward Elimination vs Full Gauss-Jordan Reduction.
            </p>
          </div>

          {/* Stepper Controls: Prev / Play / Next / Step Counter */}
          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)]">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setCurrentStep((p) => Math.max(0, p - 1));
                  setIsPlaying(false);
                }}
                disabled={currentStep === 0}
                className="p-1.5 rounded-md hover:bg-[var(--bg-surface)] disabled:opacity-30 disabled:cursor-not-allowed transition text-[var(--text-primary)] cursor-pointer"
                title="Previous step"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  soundFx.playClick();
                  setIsPlaying(!isPlaying);
                }}
                className="px-2.5 py-1 rounded-md bg-[var(--accent)] text-white font-semibold text-xs flex items-center gap-1 transition shadow-sm cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Autoplay'}</span>
              </button>

              <button
                onClick={() => {
                  soundFx.playClick();
                  setCurrentStep((p) => Math.min(maxSteps - 1, p + 1));
                  setIsPlaying(false);
                }}
                disabled={currentStep >= maxSteps - 1}
                className="p-1.5 rounded-md hover:bg-[var(--bg-surface)] disabled:opacity-30 disabled:cursor-not-allowed transition text-[var(--text-primary)] cursor-pointer"
                title="Next step"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs font-mono font-semibold text-[var(--text-primary)] px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)]">
              Step {currentStep} of {maxSteps - 1}
            </span>

            {/* View Mode Toggle: Side-by-Side vs Tabs */}
            <div className="flex items-center p-0.5 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] text-xs">
              <button
                onClick={() => setActiveMethodTab('sideBySide')}
                className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                  activeMethodTab === 'sideBySide'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Side-by-Side
              </button>
              <button
                onClick={() => setActiveMethodTab('gaussian')}
                className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                  activeMethodTab === 'gaussian'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Gaussian
              </button>
              <button
                onClick={() => setActiveMethodTab('gaussJordan')}
                className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                  activeMethodTab === 'gaussJordan'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Gauss-Jordan
              </button>
            </div>

            <button
              onClick={handleExportSteps}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--accent)] text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Export row elimination steps to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="w-full bg-[var(--bg-elevated)] h-1.5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / Math.max(1, maxSteps - 1)) * 100}%` }}
          />
        </div>

        {/* Matrix Display Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(activeMethodTab === 'sideBySide' || activeMethodTab === 'gaussian') && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-[var(--text-primary)]">
                  1. Gaussian Elimination (Forward Elimination)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/25">
                  ~ (1/3)n³ mult/div
                </span>
              </div>
              {renderAugmentedMatrix(
                gaussRes.steps[Math.min(currentStep, gaussRes.steps.length - 1)],
                'GE'
              )}
            </div>
          )}

          {(activeMethodTab === 'sideBySide' || activeMethodTab === 'gaussJordan') && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-[var(--text-primary)]">
                  2. Gauss-Jordan Elimination (Direct RREF)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/25">
                  Direct [I | x]
                </span>
              </div>
              {renderAugmentedMatrix(
                gaussJordanRes.steps[Math.min(currentStep, gaussJordanRes.steps.length - 1)],
                'GJ'
              )}
            </div>
          )}
        </div>

        {/* Comparison Summary & Final Solution Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Solution & Verification Card */}
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-xs text-[var(--text-primary)]">
                Final Physical Flow Rates (L/min):
              </span>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] font-semibold text-emerald-500">
                  {methodsAgree ? 'Both methods agree (|Δ| < 1e-9)' : 'Solutions computed'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-center">
              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
                <div className="text-[10px] text-[#3b82f6] font-sans font-bold">x (Pipe A)</div>
                <div className="text-base font-bold text-[var(--text-primary)]">{qA.toFixed(2)}</div>
                <div className="text-[10px] text-[var(--text-muted)]">L/min</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
                <div className="text-[10px] text-[#10b981] font-sans font-bold">y (Pipe B)</div>
                <div className="text-base font-bold text-[var(--text-primary)]">{qB.toFixed(2)}</div>
                <div className="text-[10px] text-[var(--text-muted)]">L/min</div>
              </div>
              <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
                <div className="text-[10px] text-[#f59e0b] font-sans font-bold">z (Pipe C)</div>
                <div className="text-base font-bold text-[var(--text-primary)]">{qC.toFixed(2)}</div>
                <div className="text-[10px] text-[var(--text-muted)]">L/min</div>
              </div>
            </div>
          </div>

          {/* Algorithmic Complexity Card */}
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] space-y-2 text-xs">
            <span className="font-bold text-xs text-[var(--text-primary)]">
              Algorithmic Complexity &amp; Operation Counts:
            </span>
            <div className="space-y-1.5 text-[var(--text-secondary)]">
              <div className="flex justify-between items-center">
                <span>Gaussian Elimination:</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  {gaussRes.steps.length} steps · 17 textbook ops (~18 total flops)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Gauss-Jordan Reduction:</span>
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  {gaussJordanRes.steps.length} steps · 23 textbook ops (~27 total flops)
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]/50">
                Gaussian Elimination with Back-Substitution requires ~33% fewer floating-point operations than full Gauss-Jordan reduction.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
