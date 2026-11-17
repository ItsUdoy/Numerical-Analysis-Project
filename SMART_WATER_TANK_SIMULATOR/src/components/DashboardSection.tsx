import React, { useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Download,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sliders,
  Droplets,
  Activity,
  Thermometer,
  ShieldCheck,
  TrendingUp,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { LiveTankState, SystemSettings, ODEResult, RootFindingResult, LinearSystemResult } from '../types';
import { ScadaWaterTank } from './ScadaWaterTank';
import { exportToCSV } from '../solvers';
import { soundFx } from '../utils/audio';

interface DashboardSectionProps {
  liveTank: LiveTankState;
  setLiveTank: React.Dispatch<React.SetStateAction<LiveTankState>>;
  settings: SystemSettings;
  onResetTank: () => void;
  rk4Res: ODEResult;
  newtonRes: RootFindingResult;
  gaussJordanRes: LinearSystemResult;
  onNavigate: (section: any) => void;
}

export const DashboardSectionComponent: React.FC<DashboardSectionProps> = ({
  liveTank,
  setLiveTank,
  settings,
  onResetTank,
  rk4Res,
  newtonRes,
  gaussJordanRes,
  onNavigate,
}) => {
  const percentage = (liveTank.volume / liveTank.capacity) * 100;
  const currentInflow = liveTank.pumpOn && liveTank.isRunning ? liveTank.inflowRate : 0;
  const currentOutflow = liveTank.volume > 0 && liveTank.isRunning ? liveTank.outflowRate : 0;
  const netFlow = currentInflow - currentOutflow;

  // Level status classification
  const isCriticalLow = percentage < 10;
  const isCriticalHigh = percentage >= 98;
  const levelStatus = isCriticalLow
    ? 'Critical Low'
    : isCriticalHigh
    ? 'Overflow Warning'
    : percentage <= 20
    ? 'Low Zone'
    : percentage >= 90
    ? 'High Zone'
    : 'Normal Zone';

  // ETA calculation from instantaneous net flow rate
  const etaText = useMemo(() => {
    if (!liveTank.isRunning) return 'Paused';
    if (Math.abs(netFlow) < 0.05) return 'Level steady';
    if (netFlow > 0) {
      if (liveTank.volume < settings.pumpOffThreshold) {
        const mins = (settings.pumpOffThreshold - liveTank.volume) / netFlow;
        return `Reaches ${settings.pumpOffThreshold} L in ~${mins.toFixed(1)} min`;
      } else if (liveTank.volume < liveTank.capacity) {
        const mins = (liveTank.capacity - liveTank.volume) / netFlow;
        return `Full in ~${mins.toFixed(1)} min`;
      }
      return 'Tank at capacity';
    } else {
      const mins = liveTank.volume / Math.abs(netFlow);
      return `Empty in ~${mins.toFixed(1)} min`;
    }
  }, [liveTank.isRunning, netFlow, liveTank.volume, settings.pumpOffThreshold, liveTank.capacity]);

  // Last ~60 points for compact history chart (memoized to avoid layout thrash)
  const chartData = useMemo(() => {
    return liveTank.history.slice(-60);
  }, [liveTank.history]);

  const handleExportTelemetry = () => {
    soundFx.playClick();
    const headers = ['SimTime_min', 'Volume_L', 'Percentage_%', 'Pump_State', 'Inflow_Lpm', 'Outflow_Lpm'];
    const rows = liveTank.history.map((h) => [
      h.time,
      h.volume,
      h.percentage,
      h.pump ? 'ON' : 'OFF',
      h.inflow,
      h.outflow,
    ]);
    exportToCSV(`tank_telemetry_${Date.now()}`, headers, rows);
  };

  const setTankLevel = (vol: number) => {
    soundFx.playClick();
    setLiveTank((p) => ({
      ...p,
      volume: vol,
      pumpOn: vol <= settings.pumpOnThreshold ? true : vol >= settings.pumpOffThreshold ? false : p.pumpOn,
    }));
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          ROW 1: SENSOR KPI CARDS (Water Level, pH Level, Temperature)
          ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. Water Level Card (Upgraded SCADA Twin + Compact History Chart + Alerts) */}
        <div
          className={`lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-xl border p-6 shadow-sm flex flex-col justify-between transition-all ${
            isCriticalLow
              ? 'border-rose-500 ring-2 ring-rose-500/30'
              : isCriticalHigh
              ? 'border-amber-500 ring-2 ring-amber-500/30'
              : 'border-gray-200 dark:border-slate-800'
          }`}
        >
          {/* Card Header & Status Badges */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Droplets className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h3 className="font-semibold text-[17px] sm:text-[18px] leading-[1.25] text-gray-900 dark:text-white">Water Level</h3>
                </div>
                <p className="text-[13px] text-gray-500 dark:text-slate-400 leading-[1.5]">
                  SCADA Twin & Capacity Monitoring • Click / Drag to calibrate
                </p>
              </div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${
                  isCriticalLow
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                    : isCriticalHigh
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : percentage <= 20
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                    : percentage >= 90
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                }`}
              >
                {levelStatus}
              </span>
            </div>

            {/* Accessible Alert State Banners (Never relies on color alone) */}
            {isCriticalLow && (
              <div
                role="alert"
                className="mt-3 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-[13px] font-medium leading-[1.5] flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 animate-bounce" />
                <span>
                  <strong>CRITICAL LOW LEVEL (&lt; 10%):</strong> Dry-run motor cavitation risk. Automatic refill engaged.
                </span>
              </div>
            )}
            {isCriticalHigh && (
              <div
                role="alert"
                className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-[13px] font-medium leading-[1.5] flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  <strong>OVERFLOW WARNING (&gt; 98%):</strong> Water level approaching structural limit. Inflow locked.
                </span>
              </div>
            )}
          </div>

          {/* Center Area: SCADA Tank on top/left, Telemetry & Controls beside/below */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center py-3">
            {/* Left: SVG Tank (Responsive, interactive click/drag/keyboard) */}
            <div className="sm:col-span-7 flex flex-col items-center">
              <ScadaWaterTank
                volume={liveTank.volume}
                capacity={liveTank.capacity}
                inflowRate={liveTank.inflowRate}
                outflowRate={liveTank.outflowRate}
                pumpOn={liveTank.pumpOn}
                isRunning={liveTank.isRunning}
                pumpOnThreshold={settings.pumpOnThreshold}
                pumpOffThreshold={settings.pumpOffThreshold}
                onVolumeChange={setTankLevel}
              />

              {/* ETA Line under the tank */}
              <div className="w-full mt-2 py-1.5 px-3 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-center text-[12px] font-medium text-gray-700 dark:text-slate-300 flex items-center justify-center gap-2">
                <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate">
                  ETA: <strong className="text-gray-900 dark:text-white font-mono tabular-nums font-semibold">{etaText}</strong>
                </span>
              </div>

              {/* Quick Jump Calibration Presets */}
              <div className="grid grid-cols-4 gap-1.5 w-full mt-2 text-[12px] font-mono font-semibold tabular-nums">
                <button
                  onClick={() => setTankLevel(150)}
                  className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-blue-500 text-gray-700 dark:text-slate-300 text-center transition"
                  title="Set to 150L (Low Zone)"
                >
                  150L
                </button>
                <button
                  onClick={() => setTankLevel(500)}
                  className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-blue-500 text-gray-700 dark:text-slate-300 text-center transition"
                  title="Set to 500L (Mid Zone)"
                >
                  500L
                </button>
                <button
                  onClick={() => setTankLevel(900)}
                  className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-amber-500 text-gray-700 dark:text-slate-300 text-center transition"
                  title="Set to 900L (High Cutoff)"
                >
                  900L
                </button>
                <button
                  onClick={() => setTankLevel(1000)}
                  className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-rose-500 text-gray-700 dark:text-slate-300 text-center transition"
                  title="Set to 1000L (Max Tank Capacity)"
                >
                  1000L
                </button>
              </div>
            </div>

            {/* Right: Telemetry & Simulation Controls (Moved outside of tank water area) */}
            <div className="sm:col-span-5 space-y-3.5 font-sans">
              <div>
                <p className="text-[13px] text-gray-500 dark:text-slate-400 mb-0.5 font-medium tracking-[0.02em]">Current Capacity</p>
                <div className="font-mono font-bold text-[34px] leading-[1.1] tracking-[-0.02em] tabular-nums text-gray-900 dark:text-white">
                  {percentage.toFixed(1)}%
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isCriticalLow
                        ? 'bg-rose-500'
                        : isCriticalHigh
                        ? 'bg-amber-500'
                        : 'bg-blue-600 dark:bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                  />
                </div>
              </div>

              <div>
                <p className="text-[13px] text-gray-500 dark:text-slate-400 mb-0.5 font-medium tracking-[0.02em]">Stored Fluid Volume</p>
                <div className="text-[16px] font-bold text-gray-900 dark:text-white font-mono tabular-nums">
                  {liveTank.volume.toFixed(1)} L{' '}
                  <span className="text-[13px] font-normal text-gray-500 dark:text-slate-400 font-sans">
                    / {liveTank.capacity} L
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[13px] text-gray-500 dark:text-slate-400 mb-0.5 font-medium tracking-[0.02em]">Net Dynamic Flow</p>
                <div
                  className={`text-[14px] font-bold font-mono tabular-nums ${
                    netFlow > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : netFlow < 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-500'
                  }`}
                >
                  {netFlow > 0 ? `▲ +${netFlow.toFixed(1)}` : netFlow < 0 ? `▼ ${netFlow.toFixed(1)}` : '● 0.0'} L/min
                </div>
              </div>

              {/* Pump & Valve Quick Badges */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-center">
                  <span className="text-[11px] text-gray-500 dark:text-slate-400 block font-bold font-sans tracking-[0.04em] uppercase">PUMP</span>
                  <span
                    className={`text-[12px] font-bold font-mono ${
                      liveTank.pumpOn && liveTank.isRunning
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : liveTank.pumpOn
                        ? 'text-sky-600 dark:text-sky-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {liveTank.pumpOn && liveTank.isRunning ? 'RUNNING' : liveTank.pumpOn ? 'READY' : 'OFF'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-center">
                  <span className="text-[11px] text-gray-500 dark:text-slate-400 block font-bold font-sans tracking-[0.04em] uppercase">VALVE</span>
                  <span
                    className={`text-[12px] font-bold font-mono ${
                      liveTank.pumpOn ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
                    }`}
                  >
                    {liveTank.pumpOn ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
              </div>

              {/* Simulation Start / Pause / Reset Controls */}
              <div className="flex gap-2 pt-1 border-t border-gray-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    soundFx.playClick();
                    setLiveTank((p) => ({ ...p, isRunning: !p.isRunning }));
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition ${
                    liveTank.isRunning
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  }`}
                >
                  {liveTank.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{liveTank.isRunning ? 'Pause Sim' : 'Start Sim'}</span>
                </button>
                <button
                  onClick={() => {
                    soundFx.playClick();
                    onResetTank();
                  }}
                  className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-slate-300 transition"
                  title="Reset to 200L"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Compact Level-Over-Time Chart with Threshold Reference Lines */}
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-[13px] text-gray-500 dark:text-slate-400 font-semibold mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Level-Over-Time Horizon</span>
              </div>
              <span className="font-mono text-[11px] sm:text-[12px] tabular-nums">
                {chartData.length} Points • Band: {settings.pumpOnThreshold}L ↔ {settings.pumpOffThreshold}L
              </span>
            </div>

            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scadaLevelAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis domain={[0, liveTank.capacity]} tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'var(--font-mono)' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="p-2 rounded-md bg-gray-900 text-white text-[12px] font-mono tabular-nums shadow-lg border border-slate-700">
                            <div>Time: {Number(d.time).toFixed(1)}m</div>
                            <div className="text-cyan-300 font-bold">Vol: {Number(d.volume).toFixed(1)} L</div>
                            <div className="text-gray-400">Flow: +{d.inflow} / -{d.outflow} L/m</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {/* High Shutoff Reference Line */}
                  <ReferenceLine
                    y={settings.pumpOffThreshold}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Off: ${settings.pumpOffThreshold}L`,
                      fill: '#ef4444',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      position: 'insideTopRight',
                    }}
                  />
                  {/* Low Trigger Reference Line */}
                  <ReferenceLine
                    y={settings.pumpOnThreshold}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `On: ${settings.pumpOnThreshold}L`,
                      fill: '#f59e0b',
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      position: 'insideBottomRight',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="#0284c7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#scadaLevelAreaGrad)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 2. pH Level Card (Matching Figma's Pp Component) */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-[17px] sm:text-[18px] leading-[1.25] text-gray-900 dark:text-white">pH Level</h3>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] sm:text-[12px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Optimal
            </span>
          </div>

          <div className="flex flex-col items-center py-4">
            <div className="font-mono font-bold text-[34px] leading-[1.1] tracking-[-0.02em] tabular-nums text-gray-900 dark:text-white mb-1">7.2</div>
            <p className="text-[13px] text-emerald-600 dark:text-emerald-400 font-medium">
              Optimal balance for storage
            </p>

            <div className="w-full mt-6 space-y-2">
              <div className="h-2.5 w-full bg-gradient-to-r from-rose-500 via-emerald-500 to-blue-500 rounded-full" />
              <div className="flex justify-between text-[11px] sm:text-[12px] font-mono tabular-nums text-gray-500 dark:text-slate-400">
                <span>Acidic (0)</span>
                <span className="font-bold text-gray-700 dark:text-slate-200">Neutral (7)</span>
                <span>Basic (14)</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-800 text-[12px] leading-relaxed text-gray-500 dark:text-slate-400">
            Water is in safe neutral range. Sensor verified.
          </div>
        </div>

        {/* 3. Temperature Card (Matching Figma's Tp Component) */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-[17px] sm:text-[18px] leading-[1.25] text-gray-900 dark:text-white">Temperature</h3>
            </div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] sm:text-[12px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Optimal
            </span>
          </div>

          <div className="flex flex-col items-center py-4">
            <div className="font-mono font-bold text-[34px] leading-[1.1] tracking-[-0.02em] tabular-nums text-gray-900 dark:text-white mb-1">24.0°C</div>
            <p className="text-[13px] font-mono tabular-nums text-gray-500 dark:text-slate-400 font-medium">75.2°F</p>

            <div className="w-full mt-6 space-y-2">
              <div className="h-2.5 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '48%' }} />
              </div>
              <div className="flex justify-between text-[11px] sm:text-[12px] font-mono tabular-nums text-gray-500 dark:text-slate-400">
                <span>0°C (Min)</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">Safe (15–28°C)</span>
                <span>50°C (Max)</span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-800 text-[12px] leading-relaxed text-gray-500 dark:text-slate-400">
            Stable ambient temperature. Zero risk of freezing or bacterial bloom.
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 2: WATER QUALITY CARD & WATER VALVE CONTROL (MATCHING FIGMA _h & zp)
          ===================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 4. Water Quality Card (Matching Figma's zp Component) */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-semibold text-[17px] sm:text-[18px] leading-[1.25] text-gray-900 dark:text-white">Water Quality</h3>
          </div>

          <div className="flex flex-col items-center py-2">
            <div className="relative w-36 h-36 mb-4 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  stroke="#e5e7eb"
                  strokeWidth="12"
                  fill="none"
                  className="dark:stroke-slate-800"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  stroke="#2563eb"
                  strokeWidth="12"
                  fill="none"
                  strokeDasharray={2 * Math.PI * 60}
                  strokeDashoffset={2 * Math.PI * 60 * (1 - 0.94)}
                  strokeLinecap="round"
                  className="dark:stroke-blue-500 transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono font-bold text-[34px] leading-[1.1] tracking-[-0.02em] tabular-nums text-gray-900 dark:text-white">94%</span>
                <span className="text-[13px] text-emerald-600 dark:text-emerald-400 font-semibold">Excellent</span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-3 pt-2 text-center text-[12px]">
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-800">
                <p className="text-gray-500 dark:text-slate-400 font-medium">Clarity</p>
                <p className="font-bold font-mono tabular-nums text-[13px] text-gray-900 dark:text-white">98%</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-slate-900/60 border border-gray-100 dark:border-slate-800">
                <p className="text-gray-500 dark:text-slate-400 font-medium">Purity</p>
                <p className="font-bold font-mono tabular-nums text-[13px] text-gray-900 dark:text-white">96%</p>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Water Valve & Automatic Hysteresis Control (Matching Figma's _h Component) */}
        <div className="md:col-span-2 bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-[17px] sm:text-[18px] leading-[1.25] text-gray-900 dark:text-white">Water Valve & Hysteresis Control</h3>
            </div>
            <button
              onClick={handleExportTelemetry}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 text-[12px] font-medium text-gray-700 dark:text-slate-300 flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Telemetry</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {/* Valve Status Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800">
                <div>
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white">Valve Status</p>
                  <p className="text-[12px] text-gray-500 dark:text-slate-400">Inlet pump flow feed</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[13px] font-bold font-mono tabular-nums ${
                      liveTank.pumpOn ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'
                    }`}
                  >
                    {liveTank.pumpOn ? 'OPEN' : 'CLOSED'}
                  </span>
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      setLiveTank((p) => ({ ...p, pumpOn: !p.pumpOn }));
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                      liveTank.pumpOn ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        liveTank.pumpOn ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Auto Mode Hysteresis Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900/60 rounded-lg border border-gray-200 dark:border-slate-800">
                <div>
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white">Auto Mode</p>
                  <p className="text-[12px] text-gray-500 dark:text-slate-400">Automatic hysteresis</p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-[13px] font-bold font-mono tabular-nums ${
                      !liveTank.manualOverride ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'
                    }`}
                  >
                    {!liveTank.manualOverride ? 'ON' : 'OFF'}
                  </span>
                  <button
                    onClick={() => {
                      soundFx.playClick();
                      setLiveTank((p) => ({ ...p, manualOverride: !p.manualOverride }));
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                      !liveTank.manualOverride ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        !liveTank.manualOverride ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Hysteresis Status Box */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-lg flex flex-col justify-between space-y-3">
              <div>
                <p className="text-[13px] font-semibold text-blue-900 dark:text-blue-200 mb-1">
                  Automatic Hysteresis (200L ON / 900L OFF)
                </p>
                <p className="text-[12px] text-blue-700 dark:text-blue-300 leading-relaxed">
                  Prevents relay chattering by maintaining a 700 L deadband. Pump runs on a 40% duty cycle.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px] font-mono tabular-nums pt-2 border-t border-blue-200 dark:border-blue-800/60">
                <div>
                  <span className="text-blue-600 dark:text-blue-400">Inflow Rate:</span>
                  <p className="font-bold text-[13px] text-gray-900 dark:text-white">+{liveTank.inflowRate} L/min</p>
                </div>
                <div>
                  <span className="text-blue-600 dark:text-blue-400">Drainage Rate:</span>
                  <p className="font-bold text-[13px] text-gray-900 dark:text-white">-{liveTank.outflowRate} L/min</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          ROW 3: 8 NUMERICAL METHODS STATUS & RECENT ALERTS (MATCHING FIGMA Rh)
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Numerical Methods Status Cards */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-[17px] sm:text-[18px] leading-[1.25] text-gray-900 dark:text-white">8 Numerical Solvers Status</h3>
            </div>
            <span className="text-[11px] sm:text-[12px] text-blue-600 dark:text-blue-400 font-semibold">Active Solvers</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              onClick={() => onNavigate('num-lab')}
              className="p-3.5 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 hover:border-blue-500 transition cursor-pointer space-y-1"
            >
              <span className="text-[11px] text-gray-500 dark:text-slate-400 font-bold font-sans tracking-[0.04em] uppercase">ODE SOLVER</span>
              <p className="font-bold text-gray-900 dark:text-white text-[14px] sm:text-[15px]">RK4 Method</p>
              <p className="text-blue-600 dark:text-blue-400 font-bold font-mono tabular-nums text-[13px]">V = {rk4Res.finalVolume.toFixed(2)} L</p>
              <p className="text-[11px] sm:text-[12px] text-gray-400 dark:text-slate-500 font-medium">O(h⁴) Precision</p>
            </div>

            <div
              onClick={() => onNavigate('prediction')}
              className="p-3.5 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 hover:border-blue-500 transition cursor-pointer space-y-1"
            >
              <span className="text-[11px] text-gray-500 dark:text-slate-400 font-bold font-sans tracking-[0.04em] uppercase">ROOT FINDING</span>
              <p className="font-bold text-gray-900 dark:text-white text-[14px] sm:text-[15px]">Newton-Raphson</p>
              <p className="text-emerald-600 dark:text-emerald-400 font-bold font-mono tabular-nums text-[13px]">
                {newtonRes.root ? `t* = ${newtonRes.root.toFixed(2)}m` : 'Pending'}
              </p>
              <p className="text-[11px] sm:text-[12px] text-gray-400 dark:text-slate-500 font-medium">3 Quadratic Iters</p>
            </div>

            <div
              onClick={() => onNavigate('distribution')}
              className="p-3.5 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 hover:border-blue-500 transition cursor-pointer space-y-1"
            >
              <span className="text-[11px] text-gray-500 dark:text-slate-400 font-bold font-sans tracking-[0.04em] uppercase">PIPE NETWORK</span>
              <p className="font-bold text-gray-900 dark:text-white text-[14px] sm:text-[15px]">Gauss-Jordan</p>
              <p className="text-indigo-600 dark:text-indigo-400 font-bold font-mono tabular-nums text-[13px]">
                {gaussJordanRes.solution
                  ? `[${gaussJordanRes.solution.map((v) => v.toFixed(0)).join(', ')}] L/min`
                  : 'Solved'}
              </p>
              <p className="text-[11px] sm:text-[12px] text-gray-400 dark:text-slate-500 font-medium">RREF Solved</p>
            </div>
          </div>
        </div>

        {/* Recent Alerts Feed (Matching Figma's Rh Component with colored cards) */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-[17px] sm:text-[18px] leading-[1.25] text-gray-900 dark:text-white">Recent Alerts</h3>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] sm:text-[12px] font-semibold border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300">
              {liveTank.alerts.length} alerts
            </span>
          </div>

          <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
            {liveTank.alerts.slice(0, 5).map((r) => {
              const isCritical = r.type === 'CRITICAL';
              const isWarning = r.type === 'WARNING';
              return (
                <div
                  key={r.id}
                  className={`p-3.5 rounded-lg border transition-all hover:shadow-md ${
                    isCritical
                      ? 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50'
                      : isWarning
                      ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50'
                      : 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isCritical ? (
                        <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                      ) : isWarning ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-snug">
                        {r.message}
                      </p>
                      <p className="text-[11px] sm:text-[12px] font-mono tabular-nums text-gray-500 dark:text-slate-400 mt-0.5">
                        {r.timestamp} • Sim time: {r.simTime.toFixed(1)}m
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-sans ${
                        isCritical
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                          : isWarning
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                      }`}
                    >
                      {r.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DashboardSection = React.memo(DashboardSectionComponent);
