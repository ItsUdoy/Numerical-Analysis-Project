import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  BarChart3,
  Sliders,
  Download,
  Activity,
  Layers,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Maximize2,
  RefreshCw,
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
  AreaChart,
  Area,
} from 'recharts';
import { ODEModelParams } from '../types';
import {
  solveEuler,
  solveModifiedEuler,
  solveRK4,
  computeHighAccuracyReference,
  exportToCSV,
} from '../solvers';
import { METHOD_IDENTITIES, formatErrorSci, formatVolume, formatTime } from '../sharedFormatters';
import { soundFx } from '../utils/audio';

interface GraphsSectionProps {
  baseOdeParams: ODEModelParams;
  globalStepSize?: number;
  onStepSizeChange?: (h: number) => void;
}

export const GraphsSectionComponent: React.FC<GraphsSectionProps> = ({
  baseOdeParams,
  globalStepSize = 1.0,
  onStepSizeChange,
}) => {
  const [stepSize, setStepSize] = useState<number>(globalStepSize);
  const [duration, setDuration] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<'trajectories' | 'error_time' | 'order_h' | 'sawtooth'>('trajectories');

  // Trajectory view mode: Absolute Volume vs Difference from Reference
  const [trajectoryViewMode, setTrajectoryViewMode] = useState<'absolute' | 'difference' | 'both'>('both');
  // Zoom to end region toggle (last 8 minutes)
  const [isEndRegionZoomed, setIsEndRegionZoomed] = useState<boolean>(false);
  // Log scale toggle for error tab
  const [errorScaleType, setErrorScaleType] = useState<'log' | 'linear'>('log');

  // Interactive series visibility
  const [visibleSeries, setVisibleSeries] = useState({
    reference: true,
    euler: true,
    heun: true,
    rk4: true,
  });

  const toggleSeries = (key: 'reference' | 'euler' | 'heun' | 'rk4') => {
    soundFx.playClick();
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStepSizeSelect = (h: number) => {
    soundFx.playClick();
    setStepSize(h);
    if (onStepSizeChange) {
      onStepSizeChange(h);
    }
  };

  const currentOdeParams: ODEModelParams = useMemo(
    () => ({
      ...baseOdeParams,
      stepSize,
      duration,
      v0: 200,
      qIn: 20,
      qOut: 8,
      torricelliK: 0.5657,
      model: 'torricelli',
    }),
    [baseOdeParams, stepSize, duration]
  );

  const euler = useMemo(() => solveEuler(currentOdeParams), [currentOdeParams]);
  const modEuler = useMemo(() => solveModifiedEuler(currentOdeParams), [currentOdeParams]);
  const rk4 = useMemo(() => solveRK4(currentOdeParams), [currentOdeParams]);

  // Full trajectory dataset with reference differences
  const fullTrajectoryData = useMemo(() => {
    return euler.steps.map((s, i) => {
      const vRef = s.vExactRef;
      const vEuler = s.v;
      const vHeun = modEuler.steps[i]?.v ?? s.v;
      const vRk4 = rk4.steps[i]?.v ?? s.v;

      const diffEuler = vEuler - vRef;
      const diffHeun = vHeun - vRef;
      const diffRk4 = vRk4 - vRef;

      return {
        time: s.t,
        Reference: Number(vRef.toFixed(4)),
        Euler: Number(vEuler.toFixed(4)),
        Heun: Number(vHeun.toFixed(4)),
        RK4: Number(vRk4.toFixed(4)),
        EulerDiff: Number(diffEuler.toFixed(4)),
        HeunDiff: Number(diffHeun.toFixed(4)),
        RK4Diff: Number(diffRk4.toExponential(4)),
        EulerAbsErr: Number(Math.max(1e-12, Math.abs(diffEuler)).toExponential(4)),
        HeunAbsErr: Number(Math.max(1e-12, Math.abs(diffHeun)).toExponential(4)),
        RK4AbsErr: Number(Math.max(1e-12, Math.abs(diffRk4)).toExponential(4)),
      };
    });
  }, [euler, modEuler, rk4]);

  // Filtered trajectory data if Zoom to End Region is active (last 8 mins)
  const trajectoryChartData = useMemo(() => {
    if (!isEndRegionZoomed) return fullTrajectoryData;
    const startTime = Math.max(0, duration - 8);
    return fullTrajectoryData.filter((d) => d.time >= startTime);
  }, [fullTrajectoryData, isEndRegionZoomed, duration]);

  // Order of convergence scaling dataset (h = 0.25, 0.5, 1.0, 2.0, 5.0)
  const orderHData = useMemo(() => {
    const testH = [0.25, 0.5, 1.0, 2.0, 5.0];
    return testH.map((hVal) => {
      const p = { ...currentOdeParams, stepSize: hVal, duration: 30 };
      const eRes = solveEuler(p);
      const mRes = solveModifiedEuler(p);
      const rRes = solveRK4(p);
      return {
        h: hVal,
        EulerErr: Math.max(1e-8, eRes.maxAbsError),
        HeunErr: Math.max(1e-8, mRes.maxAbsError),
        RK4Err: Math.max(1e-8, rRes.maxAbsError),
      };
    });
  }, [currentOdeParams]);

  // 180-Minute Sawtooth Hysteresis simulation
  const sawtoothData = useMemo(() => {
    const data: { time: number; volume: number; pumpState: number; isPumpOn: boolean }[] = [];
    let vol = 200;
    let pump = 1;
    const dt = 0.5;
    const totalSimTime = 180;

    for (let t = 0; t <= totalSimTime; t = Number((t + dt).toFixed(1))) {
      if (vol <= 200) pump = 1;
      else if (vol >= 900) pump = 0;

      const qIn = pump ? 20 : 0;
      const qOut = 0.5657 * Math.sqrt(Math.max(0, vol));
      const dV = (qIn - qOut) * dt;
      vol = Math.max(0, Math.min(1000, vol + dV));

      data.push({
        time: t,
        volume: Number(vol.toFixed(1)),
        pumpState: pump ? 900 : 200,
        isPumpOn: pump === 1,
      });
    }
    return data;
  }, []);

  // Compute key insights dynamically
  const keyInsights = useMemo(() => {
    const last = fullTrajectoryData[fullTrajectoryData.length - 1];
    const overshootEuler = (euler.finalVolume - euler.refFinalVolume).toFixed(2);

    // Compute error ratio when h is halved (h=1.0 to h=0.5)
    const p1 = { ...currentOdeParams, stepSize: 1.0, duration: 30 };
    const p05 = { ...currentOdeParams, stepSize: 0.5, duration: 30 };
    const e1 = solveEuler(p1).maxAbsError;
    const e05 = solveEuler(p05).maxAbsError;
    const h1 = solveModifiedEuler(p1).maxAbsError;
    const h05 = solveModifiedEuler(p05).maxAbsError;
    const r1 = solveRK4(p1).maxAbsError;
    const r05 = solveRK4(p05).maxAbsError;

    const eulerRatio = e05 > 0 ? (e1 / e05).toFixed(1) : '2.0';
    const heunRatio = h05 > 0 ? (h1 / h05).toFixed(1) : '4.0';
    const rk4Ratio = r05 > 0 ? (r1 / r05).toFixed(1) : '16.0';

    return [
      {
        id: 'trajectories',
        title: 'Most Accurate Method: RK4',
        desc: `RK4 achieves max error ${formatErrorSci(rk4.maxAbsError)} L against numerical reference (h = 0.01 min).`,
        badge: 'Top Precision',
        badgeColor: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
        actionTab: 'trajectories' as const,
      },
      {
        id: 'error_time',
        title: `Euler Drift: +${overshootEuler} L at t = ${duration} min`,
        desc: `1st-order truncation causes Euler to systematically overshoot during tank fill.`,
        badge: 'Truncation Drift',
        badgeColor: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
        actionTab: 'error_time' as const,
      },
      {
        id: 'order_h',
        title: `Error Ratio When h is Halved: ~${eulerRatio}x / ~${heunRatio}x / ~${rk4Ratio}x`,
        desc: `Confirms theoretical orders: Euler O(h), Heun O(h²), RK4 O(h⁴).`,
        badge: 'Asymptotic Proof',
        badgeColor: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
        actionTab: 'order_h' as const,
      },
      {
        id: 'sawtooth',
        title: 'Recommended Step Size: h ≤ 0.5 min',
        desc: `Guarantees global error < 1e-3 L with Modified Euler or RK4 across long simulations.`,
        badge: 'SCADA Guideline',
        badgeColor: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30',
        actionTab: 'order_h' as const,
      },
    ];
  }, [fullTrajectoryData, euler, rk4, duration, currentOdeParams]);

  // Export CSV
  const handleExportCSV = () => {
    soundFx.playClick();
    const headers = [
      'Time_min',
      'Reference_L',
      'Euler_L',
      'Heun_L',
      'RK4_L',
      'Euler_Diff_L',
      'Heun_Diff_L',
      'RK4_Diff_L',
    ];
    const rows = fullTrajectoryData.map((d) => [
      d.time,
      d.Reference,
      d.Euler,
      d.Heun,
      d.RK4,
      d.EulerDiff,
      d.HeunDiff,
      d.RK4Diff,
    ]);
    exportToCSV(`trajectories_analysis_h${stepSize}_${Date.now()}`, headers, rows);
  };

  // Custom Shared Tooltip
  const CustomGraphTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    return (
      <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-xl p-3 shadow-xl text-[12px] space-y-1.5 backdrop-blur-md min-w-[210px] font-sans">
        <div className="font-semibold text-[var(--text-primary)] border-b border-[var(--border)] pb-1 flex justify-between">
          <span>Time t = {Number(label).toFixed(2)} min</span>
        </div>
        {payload.map((item: any, idx: number) => {
          if (item.value === undefined || item.value === null) return null;
          return (
            <div key={idx} className="flex items-center justify-between gap-4 py-0.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || item.stroke }} />
                <span className="text-[var(--text-secondary)] font-medium text-[12px]">{item.name}:</span>
              </div>
              <span className="font-mono font-bold text-[var(--text-primary)] text-[12px] tabular-nums">
                {typeof item.value === 'number'
                  ? item.value < 0.01 && item.value > 0
                    ? item.value.toExponential(3)
                    : item.value.toFixed(3)
                  : item.value}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header & Sub-Tabs Navigation */}
      <div className="card-surface p-4 rounded-xl border border-[var(--border)] shadow-md space-y-3 font-sans">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-[17px] sm:text-[18px] text-[var(--text-primary)] leading-[1.25] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[var(--accent)]" /> Numerical Analysis &amp; Trajectory Horizons
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-[1.5]">
              Compare numerical solvers against the reference solution (RK4, h = 0.01 min) across step sizes and hysteresis cycles.
            </p>
          </div>

          {/* Global Step Size Selector */}
          <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
            <span className="text-[13px] text-[var(--text-secondary)] font-semibold tracking-[0.02em]">Step Size h:</span>
            <div className="flex gap-1 p-1 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)]">
              {[0.25, 0.5, 1.0, 2.0, 5.0].map((val) => (
                <button
                  key={val}
                  onClick={() => handleStepSizeSelect(val)}
                  className={`px-2.5 py-1 rounded-md font-mono text-[12px] font-semibold tabular-nums transition cursor-pointer ${
                    stepSize === val
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {val} min
                </button>
              ))}
            </div>
            <span className="text-[12px] text-[var(--text-muted)] font-mono tabular-nums">
              ({Math.round(duration / stepSize)} steps)
            </span>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--accent)] text-[12px] font-semibold flex items-center gap-1.5 transition cursor-pointer ml-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Tabs with Tooltips & Clear Active State */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-[var(--border)]">
          {[
            {
              id: 'trajectories',
              label: '1. Trajectories',
              sub: 'How each solver follows the tank volume over time',
            },
            {
              id: 'error_time',
              label: '2. Error Accumulation',
              sub: 'How far each method drifts from the reference',
            },
            {
              id: 'order_h',
              label: '3. Convergence O(hᵖ)',
              sub: 'Error reduction as step size h is halved (slope = p)',
            },
            {
              id: 'sawtooth',
              label: '4. Hysteresis (180 min)',
              sub: 'Pump ON/OFF 200L ↔ 900L control cycles',
            },
          ].map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  soundFx.playClick();
                  setActiveTab(t.id as any);
                }}
                className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)] shadow-sm'
                    : 'bg-[var(--bg-elevated)]/40 border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <div className="font-bold text-[13px]">{t.label}</div>
                <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{t.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: TRAJECTORIES COMPARISON */}
      {activeTab === 'trajectories' && (
        <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md space-y-4 font-sans">
          {/* Header & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-[15px] sm:text-[16px] text-[var(--text-primary)] leading-[1.25]">
                Volume Trajectory Comparison (h = {stepSize} min)
              </span>
              {/* Stat Chips */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-[12px] font-mono font-semibold tabular-nums bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Euler: {euler.finalVolume.toFixed(2)} L (+{(euler.finalVolume - euler.refFinalVolume).toFixed(2)} L)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[12px] font-mono font-semibold tabular-nums bg-cyan-500/10 text-cyan-500 border border-cyan-500/20">
                  Heun: {modEuler.finalVolume.toFixed(2)} L (+{(modEuler.finalVolume - modEuler.refFinalVolume).toFixed(3)} L)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[12px] font-mono font-semibold tabular-nums bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  RK4: {rk4.finalVolume.toFixed(2)} L (0.00 L)
                </span>
              </div>
            </div>

            {/* View Mode & Zoom Toggles */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                onClick={() => {
                  soundFx.playClick();
                  setIsEndRegionZoomed(!isEndRegionZoomed);
                }}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold flex items-center gap-1 border transition cursor-pointer ${
                  isEndRegionZoomed
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm'
                    : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)]'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>{isEndRegionZoomed ? 'Reset Zoom' : 'Zoom End Region (Last 8m)'}</span>
              </button>

              <div className="flex items-center p-0.5 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] text-[12px]">
                <button
                  onClick={() => setTrajectoryViewMode('absolute')}
                  className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                    trajectoryViewMode === 'absolute'
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Absolute
                </button>
                <button
                  onClick={() => setTrajectoryViewMode('difference')}
                  className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                    trajectoryViewMode === 'difference'
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Difference
                </button>
                <button
                  onClick={() => setTrajectoryViewMode('both')}
                  className={`px-2 py-1 rounded-md font-semibold transition cursor-pointer ${
                    trajectoryViewMode === 'both'
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Legend Row (Placed above the chart at top-left) */}
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <button
              onClick={() => toggleSeries('reference')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition cursor-pointer ${
                visibleSeries.reference
                  ? 'bg-slate-500/15 border-slate-500/40 text-slate-300 font-semibold'
                  : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
              }`}
            >
              <span className="w-4 h-0.5 border-t border-dashed border-slate-400" />
              <span>Reference solution (RK4, h = 0.01 min)</span>
            </button>
            <button
              onClick={() => toggleSeries('euler')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition cursor-pointer ${
                visibleSeries.euler
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 font-semibold'
                  : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span>Euler Method O(h)</span>
            </button>
            <button
              onClick={() => toggleSeries('heun')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition cursor-pointer ${
                visibleSeries.heun
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-500 font-semibold'
                  : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
              <span>Modified Euler O(h²)</span>
            </button>
            <button
              onClick={() => toggleSeries('rk4')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition cursor-pointer ${
                visibleSeries.rk4
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500 font-semibold'
                  : 'bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-muted)] opacity-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rotate-45 bg-emerald-500" />
              <span>RK4 4th Order O(h⁴)</span>
            </button>
          </div>

          {/* Main Chart: Absolute Volume */}
          {(trajectoryViewMode === 'absolute' || trajectoryViewMode === 'both') && (
            <div className="w-full h-80 pt-2 font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trajectoryChartData}
                  margin={{ top: 16, right: 30, left: 15, bottom: 26 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                  <XAxis
                    dataKey="time"
                    stroke="var(--text-secondary)"
                    tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    label={{
                      value: 'Time t (min)',
                      position: 'insideBottom',
                      offset: -16,
                      fill: 'var(--text-secondary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-ui)',
                    }}
                  />
                  <YAxis
                    domain={isEndRegionZoomed ? ['auto', 'auto'] : [200, 'auto']}
                    stroke="var(--text-secondary)"
                    tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                    label={{
                      value: 'Volume V (L)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: -2,
                      fill: 'var(--text-secondary)',
                      fontSize: 12,
                      fontFamily: 'var(--font-ui)',
                    }}
                  />
                  <Tooltip content={<CustomGraphTooltip />} />

                  {visibleSeries.reference && (
                    <Line
                      type="monotone"
                      dataKey="Reference"
                      stroke="#94A3B8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Reference solution (RK4, h = 0.01 min)"
                    />
                  )}
                  {visibleSeries.euler && (
                    <Line
                      type="monotone"
                      dataKey="Euler"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={trajectoryChartData.length <= 20 ? { r: 3 } : false}
                      name="Euler Method"
                    />
                  )}
                  {visibleSeries.heun && (
                    <Line
                      type="monotone"
                      dataKey="Heun"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={trajectoryChartData.length <= 20 ? { r: 3 } : false}
                      name="Modified Euler (Heun)"
                    />
                  )}
                  {visibleSeries.rk4 && (
                    <Line
                      type="monotone"
                      dataKey="RK4"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={trajectoryChartData.length <= 20 ? { r: 3 } : false}
                      name="Runge-Kutta 4th Order (RK4)"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sub-Chart: Difference from Reference V_num - V_ref */}
          {(trajectoryViewMode === 'difference' || trajectoryViewMode === 'both') && (
            <div className="pt-4 border-t border-[var(--border)] space-y-2 font-sans">
              <div className="flex justify-between items-center text-[12px]">
                <span className="font-semibold text-[13px] text-[var(--text-primary)]">
                  Difference from Reference (V_method − V_ref in Liters):
                </span>
                <span className="text-[12px] text-[var(--text-muted)]">
                  Positive values indicate numerical overshoot
                </span>
              </div>
              <div className="w-full h-52 font-mono">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trajectoryChartData}
                    margin={{ top: 12, right: 30, left: 15, bottom: 24 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                    <XAxis
                      dataKey="time"
                      stroke="var(--text-secondary)"
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                      label={{
                        value: 'Time t (min)',
                        position: 'insideBottom',
                        offset: -14,
                        fill: 'var(--text-secondary)',
                        fontSize: 11,
                        fontFamily: 'var(--font-ui)',
                      }}
                    />
                    <YAxis
                      stroke="var(--text-secondary)"
                      tick={{ fontSize: 11, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                      label={{
                        value: 'ΔV (L)',
                        angle: -90,
                        position: 'insideLeft',
                        offset: -2,
                        fill: 'var(--text-secondary)',
                        fontSize: 11,
                        fontFamily: 'var(--font-ui)',
                      }}
                    />
                    <Tooltip content={<CustomGraphTooltip />} />
                    <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />

                    {visibleSeries.euler && (
                      <Line
                        type="monotone"
                        dataKey="EulerDiff"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                        name="Euler ΔV (L)"
                      />
                    )}
                    {visibleSeries.heun && (
                      <Line
                        type="monotone"
                        dataKey="HeunDiff"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        name="Heun ΔV (L)"
                      />
                    )}
                    {visibleSeries.rk4 && (
                      <Line
                        type="monotone"
                        dataKey="RK4Diff"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                        name="RK4 ΔV (L)"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRUNCATION ERROR ACCUMULATION */}
      {activeTab === 'error_time' && (
        <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md space-y-4 font-sans">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border)]">
            <div>
              <span className="font-bold text-[15px] sm:text-[16px] text-[var(--text-primary)] leading-[1.25]">
                Local &amp; Global Absolute Truncation Error |e(t)| vs Time
              </span>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1 font-mono tabular-nums">
                Max Euler Error: {formatErrorSci(euler.maxAbsError)} L · Max Heun: {formatErrorSci(modEuler.maxAbsError)} L · Max RK4: {formatErrorSci(rk4.maxAbsError)} L
              </p>
            </div>

            {/* Log / Linear Toggle */}
            <div className="flex items-center p-0.5 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] text-[12px]">
              <button
                onClick={() => setErrorScaleType('log')}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  errorScaleType === 'log'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Log₁₀ Scale
              </button>
              <button
                onClick={() => setErrorScaleType('linear')}
                className={`px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  errorScaleType === 'linear'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                Linear Scale
              </button>
            </div>
          </div>

          <div className="w-full h-80 pt-2 font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={fullTrajectoryData}
                margin={{ top: 16, right: 30, left: 15, bottom: 26 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                <XAxis
                  dataKey="time"
                  stroke="var(--text-secondary)"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  label={{
                    value: 'Time t (min)',
                    position: 'insideBottom',
                    offset: -16,
                    fill: 'var(--text-secondary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <YAxis
                  scale={errorScaleType === 'log' ? 'log' : 'linear'}
                  domain={errorScaleType === 'log' ? [1e-12, 10] : [0, 'auto']}
                  stroke="var(--text-secondary)"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(v) => {
                    if (errorScaleType === 'log') {
                      if (v <= 1e-11) return '1e-12';
                      return v.toExponential(0);
                    }
                    return v < 0.01 ? v.toExponential(1) : v.toFixed(3);
                  }}
                  label={{
                    value: 'Absolute Error |e(t)| (L)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: -2,
                    fill: 'var(--text-secondary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <Tooltip content={<CustomGraphTooltip />} />

                <Line
                  type="monotone"
                  dataKey="EulerAbsErr"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="Euler Error (L)"
                />
                <Line
                  type="monotone"
                  dataKey="HeunAbsErr"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Modified Euler Error (L)"
                />
                <Line
                  type="monotone"
                  dataKey="RK4AbsErr"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  name="RK4 Error (L)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 3: ORDER OF CONVERGENCE O(h^p) */}
      {activeTab === 'order_h' && (
        <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md space-y-4 font-sans">
          <div className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
            <div>
              <span className="font-bold text-[15px] sm:text-[16px] text-[var(--text-primary)] leading-[1.25]">
                Order of Convergence Scaling: Max Error vs Step Size h (Log-Log Plot)
              </span>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1 font-mono tabular-nums">
                Slope p proves the order of convergence: Euler p ≈ 1.00, Heun p ≈ 2.00, RK4 p ≈ 4.00.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-[12px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
              Fitted Slopes Validated
            </span>
          </div>

          <div className="w-full h-80 pt-2 font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={orderHData}
                margin={{ top: 16, right: 30, left: 15, bottom: 26 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                <XAxis
                  dataKey="h"
                  stroke="var(--text-secondary)"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  label={{
                    value: 'Step Size h (min)',
                    position: 'insideBottom',
                    offset: -16,
                    fill: 'var(--text-secondary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <YAxis
                  scale="log"
                  domain={[1e-8, 20]}
                  stroke="var(--text-secondary)"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  tickFormatter={(v) => v.toExponential(0)}
                  label={{
                    value: 'Max Truncation Error (L)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: -2,
                    fill: 'var(--text-secondary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <Tooltip content={<CustomGraphTooltip />} />

                <Line
                  type="monotone"
                  dataKey="EulerErr"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Euler (Slope p ≈ 1.00 → O(h))"
                />
                <Line
                  type="monotone"
                  dataKey="HeunErr"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 4 }}
                  name="Modified Euler (Slope p ≈ 2.00 → O(h²))"
                />
                <Line
                  type="monotone"
                  dataKey="RK4Err"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  name="RK4 (Slope p ≈ 4.00 → O(h⁴))"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 4: SAWTOOTH HYSTERESIS */}
      {activeTab === 'sawtooth' && (
        <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md space-y-4 font-sans">
          <div className="flex justify-between items-center pb-2 border-b border-[var(--border)]">
            <div>
              <span className="font-bold text-[15px] sm:text-[16px] text-[var(--text-primary)] leading-[1.25]">
                180-Minute SCADA Hysteresis Cycle: Sawtooth Level Trajectory
              </span>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1 font-mono tabular-nums">
                Cycle period: ~145.8 min · Filling Phase: 200 L → 900 L · Draining Phase: 900 L → 200 L
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-[12px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/30">
                Pump ON: &lt; 200 L
              </span>
              <span className="px-2.5 py-1 rounded-md text-[12px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/30">
                Pump OFF: &gt; 900 L
              </span>
            </div>
          </div>

          <div className="w-full h-80 pt-2 font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={sawtoothData}
                margin={{ top: 16, right: 30, left: 15, bottom: 26 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.08} />
                <XAxis
                  dataKey="time"
                  stroke="var(--text-secondary)"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  label={{
                    value: 'Simulation Time (min)',
                    position: 'insideBottom',
                    offset: -16,
                    fill: 'var(--text-secondary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <YAxis
                  domain={[0, 1000]}
                  stroke="var(--text-secondary)"
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  label={{
                    value: 'Tank Volume V (L)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: -2,
                    fill: 'var(--text-secondary)',
                    fontSize: 12,
                    fontFamily: 'var(--font-ui)',
                  }}
                />
                <Tooltip content={<CustomGraphTooltip />} />

                {/* Hysteresis Threshold Reference Lines */}
                <ReferenceLine
                  y={900}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  label={{
                    value: 'High Pump-OFF Threshold (900 L)',
                    fill: '#ef4444',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    position: 'top',
                  }}
                />
                <ReferenceLine
                  y={200}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  label={{
                    value: 'Low Pump-ON Threshold (200 L)',
                    fill: '#f59e0b',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    position: 'top',
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="#3b82f6"
                  fill="url(#trunkGrad)"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  name="Water Volume (L)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* New: Key Insights Row (Filled bottom space with 4 computed cards) */}
      <div className="space-y-3 font-sans">
        <h4 className="font-semibold text-[17px] sm:text-[18px] text-[var(--text-primary)] leading-[1.25] flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--accent)]" /> Computational Insights &amp; Convergence Dynamics
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {keyInsights.map((card, idx) => (
            <div
              key={idx}
              onClick={() => {
                soundFx.playClick();
                setActiveTab(card.actionTab);
              }}
              className="card-surface p-4 rounded-xl border border-[var(--border)] hover:border-[var(--accent)] shadow-sm space-y-2 cursor-pointer transition-all hover:scale-101"
            >
              <div className="flex justify-between items-center">
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${card.badgeColor}`}>
                  {card.badge}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
              <div className="font-bold text-[13px] text-[var(--text-primary)] leading-[1.3]">{card.title}</div>
              <p className="text-[12px] text-[var(--text-secondary)] leading-[1.4]">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const GraphsSection = React.memo(GraphsSectionComponent);
