import React, { useState, useMemo, useRef } from 'react';
import {
  Settings as SettingsIcon,
  RotateCcw,
  Download,
  Upload,
  Sliders,
  Cpu,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Undo2,
  Save,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Laptop,
  Check,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { SystemSettings, ODEPhysicsModel } from '../types';
import { DEFAULT_SETTINGS } from '../solvers';
import { useApp } from '../AppContext';
import { soundFx } from '../utils/audio';

interface SettingsSectionProps {
  settings?: SystemSettings;
  setSettings?: React.Dispatch<React.SetStateAction<SystemSettings>>;
  onResetSettings?: () => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = () => {
  const {
    settings,
    updateSettings,
    saveSettings,
    discardSettings,
    resetSettingsToFactory,
    isSettingsDirty,
    pendingSettings,
    setPendingSettings,
    theme,
    setTheme,
    isSoundMuted,
    setIsSoundMuted,
    showToast,
  } = useApp();

  // Local preset tracking
  const [activePreset, setActivePreset] = useState<'academic' | 'municipal' | 'residential' | 'custom'>('academic');
  const [previousPresetSettings, setPreviousPresetSettings] = useState<SystemSettings | null>(null);

  // Confirmation dialog state for Reset Factory
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  // Import JSON file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Presets definition
  const presets = {
    academic: {
      id: 'academic' as const,
      name: 'Lab Default (Academic)',
      scale: 'BUP Course Benchmark',
      capacity: 1000,
      initial: 200,
      inflow: 20,
      outflow: 8,
      k: 0.5657,
      on: 200,
      off: 900,
      model: 'torricelli' as ODEPhysicsModel,
      duration: 30,
      stepSize: 1.0,
      tolerance: 0.0001,
    },
    municipal: {
      id: 'municipal' as const,
      name: 'Municipal Reservoir',
      scale: 'Large Municipal Utility',
      capacity: 5000,
      initial: 1000,
      inflow: 100,
      outflow: 40,
      k: 1.2649,
      on: 1000,
      off: 4500,
      model: 'torricelli' as ODEPhysicsModel,
      duration: 60,
      stepSize: 1.0,
      tolerance: 0.0001,
    },
    residential: {
      id: 'residential' as const,
      name: 'Residential Overhead',
      scale: 'Domestic Rooftop Tank',
      capacity: 500,
      initial: 100,
      inflow: 15,
      outflow: 5,
      k: 0.5,
      on: 100,
      off: 450,
      model: 'torricelli' as ODEPhysicsModel,
      duration: 40,
      stepSize: 0.5,
      tolerance: 0.0001,
    },
  };

  // Validation rules
  const validationErrors = useMemo(() => {
    const s = pendingSettings;
    const errors: Record<string, string> = {};

    if (s.tankCapacity <= 0) {
      errors.tankCapacity = 'Capacity must be greater than 0 L.';
    }
    if (s.initialVolume <= 0 || s.initialVolume > s.tankCapacity) {
      errors.initialVolume = `Initial volume must be between 1 L and capacity (${s.tankCapacity} L).`;
    }
    if (s.pumpOnThreshold <= 0 || s.pumpOnThreshold >= s.pumpOffThreshold) {
      errors.pumpOnThreshold = 'Low threshold must be > 0 and strictly less than High threshold.';
    }
    if (s.pumpOffThreshold > s.tankCapacity) {
      errors.pumpOffThreshold = `High threshold cannot exceed tank capacity (${s.tankCapacity} L).`;
    }
    if (s.inflowRate <= 0) {
      errors.inflowRate = 'Pump inflow rate must be > 0 L/min.';
    }
    if (s.outflowRate < 0) {
      errors.outflowRate = 'Outflow rate cannot be negative.';
    }
    if (s.defaultStepSize <= 0 || s.defaultStepSize > s.defaultDuration) {
      errors.defaultStepSize = `Step size h must be in (0, Duration ${s.defaultDuration} min].`;
    }
    if (s.defaultDuration <= 0) {
      errors.defaultDuration = 'Duration T must be > 0 min.';
    }
    if (s.rootTolerance < 1e-12 || s.rootTolerance > 1e-1) {
      errors.rootTolerance = 'Tolerance must be between 1e-12 and 0.1.';
    }

    return errors;
  }, [pendingSettings]);

  const isValid = Object.keys(validationErrors).length === 0;

  // Warning check: inflow <= outflow
  const inflowWarning = useMemo(() => {
    if (pendingSettings.inflowRate <= pendingSettings.outflowRate) {
      return `Warning: Inflow (${pendingSettings.inflowRate} L/min) is ≤ Outflow (${pendingSettings.outflowRate} L/min). Tank may never fill to the high threshold.`;
    }
    return null;
  }, [pendingSettings.inflowRate, pendingSettings.outflowRate]);

  // Apply a preset
  const handleApplyPreset = (key: 'academic' | 'municipal' | 'residential') => {
    soundFx.playClick();
    setPreviousPresetSettings({ ...pendingSettings });
    const p = presets[key];
    const newSettings: SystemSettings = {
      ...pendingSettings,
      tankCapacity: p.capacity,
      initialVolume: p.initial,
      inflowRate: p.inflow,
      outflowRate: p.outflow,
      torricelliK: p.k,
      pumpOnThreshold: p.on,
      pumpOffThreshold: p.off,
      physicsModel: p.model,
      defaultDuration: p.duration,
      defaultStepSize: p.stepSize,
      rootTolerance: p.tolerance,
    };
    setPendingSettings(newSettings);
    setActivePreset(key);
    showToast(`Applied preset: ${p.name}`);
  };

  // Undo preset change
  const handleUndoPreset = () => {
    if (previousPresetSettings) {
      soundFx.playClick();
      setPendingSettings(previousPresetSettings);
      setPreviousPresetSettings(null);
      setActivePreset('custom');
      showToast('Reverted to previous settings');
    }
  };

  // Export JSON
  const handleExportJSON = () => {
    soundFx.playClick();
    const exportData = {
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      generator: 'Smart Water Tank Simulator (CSE-2204)',
      settings: pendingSettings,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `tank_system_settings_v2_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Exported settings JSON file');
  };

  // Import JSON
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const imported = parsed.settings || parsed;
        if (typeof imported.tankCapacity === 'number') {
          setPendingSettings({ ...DEFAULT_SETTINGS, ...imported });
          setActivePreset('custom');
          showToast('Settings successfully imported from JSON');
        } else {
          alert('Invalid settings file schema.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 font-sans pb-16">
      {/* Banner */}
      <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
              System Calibration
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-medium">Single Source of Truth</span>
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            Global Simulation Parameters &amp; Presets
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Calibrate tank capacity, inflow/outflow dynamics, hysteresis thresholds, and numerical solver configurations.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportJSON}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--text-primary)] border border-[var(--border)] flex items-center gap-1.5 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Import JSON</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--accent)] border border-[var(--border)] flex items-center gap-1.5 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            onClick={() => setShowResetModal(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Factory</span>
          </button>
        </div>
      </div>

      {/* Engineering Presets Selector */}
      <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md space-y-4">
        <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Cpu className="w-4 h-4 text-[var(--accent)]" />
            <h3>ENGINEERING PRESETS (ONE-CLICK CALIBRATION)</h3>
          </div>
          {previousPresetSettings && (
            <button
              onClick={handleUndoPreset}
              className="text-xs text-[var(--accent)] flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo Preset</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" role="radiogroup">
          {Object.entries(presets).map(([key, p]) => {
            const isSelected = activePreset === key;
            return (
              <div
                key={key}
                onClick={() => handleApplyPreset(key as any)}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleApplyPreset(key as any);
                  }
                }}
                className={`p-4 rounded-xl border transition-all cursor-pointer space-y-3 ${
                  isSelected
                    ? 'bg-[var(--accent)]/10 border-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]'
                    : 'bg-[var(--bg-elevated)]/40 border-[var(--border)] hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                    {isSelected && <Check className="w-4 h-4 text-[var(--accent)]" />}
                    <span>{p.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    isSelected ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border-[var(--border)]'
                  }`}>
                    {isSelected ? 'Active Preset' : p.scale}
                  </span>
                </div>

                {/* Key Values as Chips */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                  <span className="p-1 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                    Cap: <strong>{p.capacity} L</strong>
                  </span>
                  <span className="p-1 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                    Init: <strong>{p.initial} L</strong>
                  </span>
                  <span className="p-1 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                    In: <strong>{p.inflow} L/min</strong>
                  </span>
                  <span className="p-1 rounded bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-secondary)]">
                    Out: <strong>{p.outflow} L/min</strong>
                  </span>
                </div>

                <div className="text-[11px] text-[var(--text-muted)] font-mono">
                  Hysteresis: {p.on} L ON ↔ {p.off} L OFF
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Hysteresis Visualizer */}
      <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Layers className="w-4 h-4 text-[var(--accent)]" />
            <span>Interactive Hysteresis Band Visualizer (0 L → {pendingSettings.tankCapacity} L)</span>
          </div>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            Band Width: {pendingSettings.pumpOffThreshold - pendingSettings.pumpOnThreshold} L
          </span>
        </div>

        {/* Dual Band Bar */}
        <div className="relative w-full h-8 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-strong)] overflow-hidden">
          {/* Low Alarm Zone (0 to Pump ON) */}
          <div
            className="absolute left-0 top-0 bottom-0 bg-amber-500/20 border-r border-amber-500/40 flex items-center justify-center text-[10px] font-mono text-amber-500 font-bold"
            style={{ width: `${(pendingSettings.pumpOnThreshold / pendingSettings.tankCapacity) * 100}%` }}
          >
            PUMP ON: {pendingSettings.pumpOnThreshold} L
          </div>

          {/* Normal Hysteresis Operating Band */}
          <div
            className="absolute top-0 bottom-0 bg-[var(--accent)]/15 border-r border-[var(--accent)]/40 flex items-center justify-center text-[10px] font-mono text-[var(--accent)] font-bold"
            style={{
              left: `${(pendingSettings.pumpOnThreshold / pendingSettings.tankCapacity) * 100}%`,
              width: `${((pendingSettings.pumpOffThreshold - pendingSettings.pumpOnThreshold) / pendingSettings.tankCapacity) * 100}%`,
            }}
          >
            Hysteresis Control Band ({pendingSettings.pumpOnThreshold} L → {pendingSettings.pumpOffThreshold} L)
          </div>

          {/* High Alarm Zone (Pump OFF to Capacity) */}
          <div
            className="absolute right-0 top-0 bottom-0 bg-rose-500/20 flex items-center justify-center text-[10px] font-mono text-rose-500 font-bold"
            style={{
              width: `${((pendingSettings.tankCapacity - pendingSettings.pumpOffThreshold) / pendingSettings.tankCapacity) * 100}%`,
            }}
          >
            PUMP OFF: {pendingSettings.pumpOffThreshold} L
          </div>

          {/* Marker for Current Initial Volume V(0) */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white shadow-md z-10"
            style={{ left: `${(pendingSettings.initialVolume / pendingSettings.tankCapacity) * 100}%` }}
            title={`Initial Volume V(0): ${pendingSettings.initialVolume} L`}
          />
        </div>

        <div className="flex justify-between text-[11px] text-[var(--text-muted)] font-mono">
          <span>0 L (Empty)</span>
          <span className="text-[var(--accent)] font-semibold">V(0) = {pendingSettings.initialVolume} L</span>
          <span>{pendingSettings.tankCapacity} L (Max Capacity)</span>
        </div>
      </div>

      {/* Main Parameters Form Grid (3 Columns on Desktop, 2 on Tablet, 1 on Mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Column 1: Tank Volume & Geometry */}
        <div className="card-surface p-5 rounded-xl border border-[var(--border)] shadow-md space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)] text-sm font-bold text-[var(--text-primary)]">
            <Sliders className="w-4 h-4 text-[var(--accent)]" />
            <span>1. Tank Volume &amp; Levels</span>
          </div>

          {/* Capacity */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Max Tank Capacity:</label>
            <div className="relative">
              <input
                type="number"
                value={pendingSettings.tankCapacity}
                onChange={(e) => {
                  setActivePreset('custom');
                  updateSettings({ tankCapacity: Number(e.target.value) });
                }}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 pr-12 text-[var(--text-primary)] font-mono font-bold text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-mono">
                L
              </span>
            </div>
            {validationErrors.tankCapacity && (
              <p className="text-[11px] text-rose-500 font-medium">{validationErrors.tankCapacity}</p>
            )}
          </div>

          {/* Initial Volume */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Initial Volume V(0):</label>
            <div className="relative">
              <input
                type="number"
                value={pendingSettings.initialVolume}
                onChange={(e) => {
                  setActivePreset('custom');
                  updateSettings({ initialVolume: Number(e.target.value) });
                }}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 pr-12 text-[var(--text-primary)] font-mono font-bold text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-mono">
                L
              </span>
            </div>
            {validationErrors.initialVolume && (
              <p className="text-[11px] text-rose-500 font-medium">{validationErrors.initialVolume}</p>
            )}
          </div>

          {/* Physics Discharge Model */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Governing Physics Model:</label>
            <select
              value={pendingSettings.physicsModel}
              onChange={(e) => {
                setActivePreset('custom');
                updateSettings({ physicsModel: e.target.value as any });
              }}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 text-[var(--text-primary)] text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none cursor-pointer"
            >
              <option value="torricelli">Torricelli Non-Linear (dV/dt = Qin − k√V)</option>
              <option value="linear">Linear Constant Flow (dV/dt = Qin − Qout)</option>
            </select>
            <p className="text-[10px] text-[var(--text-muted)]">
              {pendingSettings.physicsModel === 'torricelli'
                ? 'Exact Torricelli gravity orifice law'
                : 'Constant baseline outflow rate'}
            </p>
          </div>
        </div>

        {/* Column 2: Flow Rates & Hysteresis Limits */}
        <div className="card-surface p-5 rounded-xl border border-[var(--border)] shadow-md space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)] text-sm font-bold text-[var(--text-primary)]">
            <Sliders className="w-4 h-4 text-[var(--accent)]" />
            <span>2. Flow Rates &amp; Hysteresis</span>
          </div>

          {/* Inflow Rate */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Pump Inflow Rate:</label>
            <div className="relative">
              <input
                type="number"
                value={pendingSettings.inflowRate}
                onChange={(e) => {
                  setActivePreset('custom');
                  updateSettings({ inflowRate: Number(e.target.value) });
                }}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 pr-16 text-[var(--text-primary)] font-mono font-bold text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-mono">
                L/min
              </span>
            </div>
            {validationErrors.inflowRate && (
              <p className="text-[11px] text-rose-500 font-medium">{validationErrors.inflowRate}</p>
            )}
          </div>

          {/* Outflow Rate & Discharge Coefficient k */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Outflow Rate:</label>
              <div className="relative">
                <input
                  type="number"
                  value={pendingSettings.outflowRate}
                  onChange={(e) => {
                    setActivePreset('custom');
                    updateSettings({ outflowRate: Number(e.target.value) });
                  }}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 pr-14 text-[var(--text-primary)] font-mono text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)] font-mono">
                  L/min
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Torricelli (k):</label>
              <div className="relative">
                <input
                  type="number"
                  step={0.01}
                  value={pendingSettings.torricelliK}
                  onChange={(e) => {
                    setActivePreset('custom');
                    updateSettings({ torricelliK: Number(e.target.value) });
                  }}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 text-[var(--text-primary)] font-mono text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Inflow Warning */}
          {inflowWarning && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-[11px] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{inflowWarning}</span>
            </div>
          )}

          {/* Low Pump ON & High Pump OFF */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Pump ON Trigger:</label>
              <div className="relative">
                <input
                  type="number"
                  value={pendingSettings.pumpOnThreshold}
                  onChange={(e) => {
                    setActivePreset('custom');
                    updateSettings({ pumpOnThreshold: Number(e.target.value) });
                  }}
                  className="w-full bg-[var(--bg-elevated)] border border-amber-500/40 rounded-lg p-2.5 pr-10 text-amber-500 font-mono font-bold text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] font-mono">
                  L
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">Pump OFF Trigger:</label>
              <div className="relative">
                <input
                  type="number"
                  value={pendingSettings.pumpOffThreshold}
                  onChange={(e) => {
                    setActivePreset('custom');
                    updateSettings({ pumpOffThreshold: Number(e.target.value) });
                  }}
                  className="w-full bg-[var(--bg-elevated)] border border-rose-500/40 rounded-lg p-2.5 pr-10 text-rose-500 font-mono font-bold text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-muted)] font-mono">
                  L
                </span>
              </div>
            </div>
          </div>
          {(validationErrors.pumpOnThreshold || validationErrors.pumpOffThreshold) && (
            <p className="text-[11px] text-rose-500 font-medium">
              {validationErrors.pumpOnThreshold || validationErrors.pumpOffThreshold}
            </p>
          )}
        </div>

        {/* Column 3: Numerical Solver Configurations */}
        <div className="card-surface p-5 rounded-xl border border-[var(--border)] shadow-md space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--border)] text-sm font-bold text-[var(--text-primary)]">
            <Cpu className="w-4 h-4 text-[var(--accent)]" />
            <span>3. Solver Configurations</span>
          </div>

          {/* Default Step Size h */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Global Step Size h:</label>
            <div className="relative">
              <input
                type="number"
                step={0.1}
                value={pendingSettings.defaultStepSize}
                onChange={(e) => {
                  setActivePreset('custom');
                  updateSettings({ defaultStepSize: Number(e.target.value) });
                }}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 pr-14 text-[var(--text-primary)] font-mono font-bold text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-mono">
                min
              </span>
            </div>
            {validationErrors.defaultStepSize && (
              <p className="text-[11px] text-rose-500 font-medium">{validationErrors.defaultStepSize}</p>
            )}
          </div>

          {/* Default Duration T */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Simulation Duration T:</label>
            <div className="relative">
              <input
                type="number"
                value={pendingSettings.defaultDuration}
                onChange={(e) => {
                  setActivePreset('custom');
                  updateSettings({ defaultDuration: Number(e.target.value) });
                }}
                className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 pr-14 text-[var(--text-primary)] font-mono font-bold text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-mono">
                min
              </span>
            </div>
          </div>

          {/* Root Finding Tolerance */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">Root Finding Tolerance (ε):</label>
            <select
              value={pendingSettings.rootTolerance}
              onChange={(e) => {
                setActivePreset('custom');
                updateSettings({ rootTolerance: Number(e.target.value) });
              }}
              className="w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-2.5 text-[var(--text-primary)] font-mono text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none cursor-pointer"
            >
              <option value="0.001">10⁻³ min (~0.06 s - Fast)</option>
              <option value="0.0001">10⁻⁴ min (~0.006 s - Standard)</option>
              <option value="0.00001">10⁻⁵ min</option>
              <option value="0.000001">10⁻⁶ min (High Precision)</option>
            </select>
          </div>
        </div>
      </div>

      {/* App Preferences Section */}
      <div className="card-surface p-5 sm:p-6 rounded-xl border border-[var(--border)] shadow-md space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[var(--border)] text-sm font-bold text-[var(--text-primary)]">
          <SettingsIcon className="w-4 h-4 text-[var(--accent)]" />
          <span>APP PREFERENCES &amp; INTERFACE CONTROLS</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          {/* Theme Selector */}
          <div className="space-y-2">
            <label className="block font-medium text-[var(--text-secondary)]">Active Theme:</label>
            <div className="flex gap-2 p-1 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)]">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  theme === 'dark' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-secondary)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark Mode</span>
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  theme === 'light' ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-[var(--text-secondary)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light Mode</span>
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              Persisted in localStorage; respects WCAG AA contrast standards.
            </p>
          </div>

          {/* Sound FX */}
          <div className="space-y-2">
            <label className="block font-medium text-[var(--text-secondary)]">Audio &amp; Synthesized FX:</label>
            <button
              onClick={() => {
                const next = !isSoundMuted;
                setIsSoundMuted(next);
                if (!next) soundFx.playSuccess();
              }}
              className="w-full py-2.5 px-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--text-primary)] font-semibold flex items-center justify-between transition cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {isSoundMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4 text-emerald-500" />}
                <span>{isSoundMuted ? 'Muted (Silent)' : 'Sound Enabled'}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isSoundMuted ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                {isSoundMuted ? 'OFF' : 'ON'}
              </span>
            </button>
            <p className="text-[10px] text-[var(--text-muted)]">
              Subtle Web Audio feedback on clicks, calculations, and thresholds.
            </p>
          </div>

          {/* Simulation Speed */}
          <div className="space-y-2">
            <label className="block font-medium text-[var(--text-secondary)]">Simulation Speed:</label>
            <div className="flex gap-1 p-1 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border)]">
              {[1, 2, 5].map((speed) => (
                <button
                  key={speed}
                  onClick={() => updateSettings({ simSpeed: speed })}
                  className={`flex-1 py-2 rounded-lg font-mono font-semibold transition cursor-pointer ${
                    pendingSettings.simSpeed === speed
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-muted)]">
              Scales the live telemetry tick rate on the Dashboard and Live Sim pages.
            </p>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Action Bar when there are unsaved changes */}
      {isSettingsDirty && (
        <div className="fixed bottom-4 left-4 right-4 md:left-72 md:right-8 z-40 bg-[var(--bg-surface)] border border-[var(--accent)] rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-[var(--text-primary)]">
                You have unsaved configuration changes
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Changes will drive every page in the dashboard once saved.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={() => {
                soundFx.playClick();
                discardSettings();
                showToast('Discarded unsaved changes');
              }}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-semibold transition cursor-pointer"
            >
              Discard
            </button>
            <button
              onClick={() => {
                if (!isValid) return;
                soundFx.playSuccess();
                saveSettings();
                showToast('Settings saved and persisted');
              }}
              disabled={!isValid}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-surface p-6 rounded-2xl border border-[var(--border-strong)] max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-[var(--text-primary)]">
                Confirm Factory Reset
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Are you sure you want to restore all parameters to default factory values?
              All custom capacities, thresholds, and solver settings will be cleared.
            </p>
            <div className="pt-2 flex justify-end gap-3 text-xs font-semibold">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  soundFx.playSuccess();
                  resetSettingsToFactory();
                  setShowResetModal(false);
                  setActivePreset('academic');
                  showToast('Reset all parameters to factory defaults');
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
