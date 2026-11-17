import React from 'react';
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  Play as PlayIcon,
  Pause as PauseIcon,
  RotateCcw as RotateCcwIcon,
  Zap as ZapIcon,
  Download as DownloadIcon,
  Sliders as SlidersIcon,
  Activity as ActivityIcon,
  Layers as LayersIcon,
} from 'lucide-react';
import { LiveTankState, SystemSettings } from '../types';
import { ScadaWaterTank } from './ScadaWaterTank';
import { exportToCSV } from '../solvers';
import { soundFx } from '../utils/audio';

interface LiveSimSectionProps {
  liveTank: LiveTankState;
  setLiveTank: React.Dispatch<React.SetStateAction<LiveTankState>>;
  settings: SystemSettings;
  onResetTank: () => void;
}

export const LiveSimSection: React.FC<LiveSimSectionProps> = ({
  liveTank,
  setLiveTank,
  settings,
  onResetTank,
}) => {
  const percentage = (liveTank.volume / liveTank.capacity) * 100;

  const handleExportCSV = () => {
    soundFx.playClick();
    const headers = ['Time_min', 'Volume_L', 'Level_Pct', 'Pump_State', 'Inflow_Lpm', 'Outflow_Lpm'];
    const rows = liveTank.history.map((h) => [
      h.time,
      h.volume,
      h.percentage,
      h.pump ? '1' : '0',
      h.inflow,
      h.outflow,
    ]);
    exportToCSV(`tank_live_simulation_${Date.now()}`, headers, rows);
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
      {/* Top Controls Toolbar */}
      <div className="p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4 text-xs font-sans">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              soundFx.playClick();
              setLiveTank((p) => ({ ...p, isRunning: !p.isRunning }));
            }}
            className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 shadow-sm transition ${
              liveTank.isRunning
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {liveTank.isRunning ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
            <span>{liveTank.isRunning ? 'Pause Sim' : 'Start Sim'}</span>
          </button>

          <button
            onClick={() => {
              soundFx.playClick();
              onResetTank();
            }}
            className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 text-gray-700 dark:text-slate-300 flex items-center gap-1.5 transition"
          >
            <RotateCcwIcon className="w-4 h-4" />
            <span>Reset (200L)</span>
          </button>

          <button
            onClick={() => {
              soundFx.playClick();
              setLiveTank((p) => ({ ...p, pumpOn: !p.pumpOn }));
            }}
            className={`px-3 py-2 rounded-lg border flex items-center gap-1.5 transition ${
              liveTank.pumpOn
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                : 'border-gray-200 dark:border-slate-700 text-gray-500'
            }`}
          >
            <ZapIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Pump {liveTank.pumpOn ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Speed Multipliers */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-slate-400 font-medium">Speed:</span>
          <div className="flex gap-1">
            {[1, 2, 5, 10, 20].map((s) => (
              <button
                key={s}
                onClick={() => {
                  soundFx.playClick();
                  setLiveTank((p) => ({ ...p, speed: s }));
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition border ${
                  liveTank.speed === s
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-400 hover:bg-gray-100'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="ml-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 text-blue-600 dark:text-blue-400 flex items-center gap-1.5 transition"
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Grid: Left SCADA Twin & Controls, Right Live Telemetry Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Animated Tank & Slider Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm flex flex-col items-center">
            <ScadaWaterTank
              volume={liveTank.volume}
              capacity={liveTank.capacity}
              inflowRate={liveTank.inflowRate}
              outflowRate={liveTank.outflowRate}
              pumpOn={liveTank.pumpOn}
              isRunning={liveTank.isRunning}
              pumpOnThreshold={settings.pumpOnThreshold}
              pumpOffThreshold={settings.pumpOffThreshold}
            />

            {/* Quick Level Jump Presets */}
            <div className="w-full grid grid-cols-4 gap-1.5 mt-3 text-[10px] font-mono">
              <button
                onClick={() => setTankLevel(150)}
                className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-blue-500 text-gray-700 dark:text-slate-300 text-center transition"
              >
                150L (Low)
              </button>
              <button
                onClick={() => setTankLevel(500)}
                className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-blue-500 text-gray-700 dark:text-slate-300 text-center transition"
              >
                500L (Mid)
              </button>
              <button
                onClick={() => setTankLevel(920)}
                className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-amber-500 text-gray-700 dark:text-slate-300 text-center transition"
              >
                920L (High)
              </button>
              <button
                onClick={() => setTankLevel(1000)}
                className="py-1 px-1 rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 hover:border-rose-500 text-gray-700 dark:text-slate-300 text-center transition"
              >
                1000L (Max)
              </button>
            </div>
          </div>

          {/* Real-time Dynamic Sliders */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm space-y-4 text-xs font-sans">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <SlidersIcon className="w-4 h-4 text-blue-600" /> Live Parameters Control
            </h3>

            <div>
              <div className="flex justify-between text-gray-700 dark:text-slate-300 mb-1">
                <span>Set Fluid Volume:</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  {liveTank.volume.toFixed(1)} L ({percentage.toFixed(1)}%)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={liveTank.capacity}
                step={5}
                value={liveTank.volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setLiveTank((p) => ({
                    ...p,
                    volume: v,
                    pumpOn: v <= settings.pumpOnThreshold ? true : v >= settings.pumpOffThreshold ? false : p.pumpOn,
                  }));
                }}
                className="w-full accent-blue-600 h-2 bg-gray-200 dark:bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-gray-700 dark:text-slate-300 mb-1">
                <span>Inflow Delivery Rate:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  +{liveTank.inflowRate} L/min
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                step={1}
                value={liveTank.inflowRate}
                onChange={(e) => setLiveTank((p) => ({ ...p, inflowRate: Number(e.target.value) }))}
                className="w-full accent-emerald-500 h-2 bg-gray-200 dark:bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-gray-700 dark:text-slate-300 mb-1">
                <span>Drainage Outflow Rate:</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  -{liveTank.outflowRate} L/min
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={40}
                step={1}
                value={liveTank.outflowRate}
                onChange={(e) => setLiveTank((p) => ({ ...p, outflowRate: Number(e.target.value) }))}
                className="w-full accent-blue-500 h-2 bg-gray-200 dark:bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[11px] text-blue-900 dark:text-blue-200">
              <span className="font-bold">Hysteresis Deadband: </span>
              Pump triggers at &le; {settings.pumpOnThreshold} L and cuts off at &ge; {settings.pumpOffThreshold} L.
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Live Charts */}
        <div className="lg:col-span-7 space-y-6">
          {/* Chart 1: Water Level Volume History */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-sans">
              <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ActivityIcon className="w-4 h-4 text-blue-600" /> Tank Volume History (Sawtooth Cycle)
              </span>
              <span className="text-blue-600 dark:text-blue-400 font-bold">{liveTank.volume.toFixed(1)} L</span>
            </div>

            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={liveTank.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-slate-800" />
                  <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, liveTank.capacity]} stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    name="Volume (L)"
                    stroke="#2563eb"
                    fill="#3b82f6"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Flow Rates LineChart */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm space-y-3">
            <div className="flex items-center justify-between text-xs font-sans">
              <span className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <LayersIcon className="w-4 h-4 text-emerald-600" /> Inflow vs Outflow Dynamics (L/min)
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                In: {liveTank.pumpOn ? liveTank.inflowRate : 0} | Out: {liveTank.outflowRate}
              </span>
            </div>

            <div className="w-full h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={liveTank.history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-slate-800" />
                  <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 65]} stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="inflow"
                    name="Inflow (L/min)"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="outflow"
                    name="Outflow (L/min)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
