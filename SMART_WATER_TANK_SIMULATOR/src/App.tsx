import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Droplets,
  Calculator,
  TrendingUp,
  GitBranch,
  BarChart3,
  Scale,
  Settings as SettingsIcon,
  Sun,
  Moon,
  RefreshCw,
  Volume2,
  VolumeX,
  Menu,
  X,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import {
  SectionId,
  SystemSettings,
  LiveTankState,
  ODEModelParams,
  RootFindingParams,
} from './types';
import {
  DEFAULT_SETTINGS,
  DEFAULT_MATRIX,
  solveEuler,
  solveModifiedEuler,
  solveRK4,
  solveBisection,
  solveFalsePosition,
  solveNewtonRaphson,
  solveGaussianElimination,
  solveGaussJordan,
} from './solvers';
import { soundFx } from './utils/audio';
import { AppProvider, useApp } from './AppContext';

import { DashboardSection } from './components/DashboardSection';
import { LiveSimSection } from './components/LiveSimSection';
import { NumLabSection } from './components/NumLabSection';
import { PredictionSection } from './components/PredictionSection';
import { DistributionSection } from './components/DistributionSection';
import { GraphsSection } from './components/GraphsSection';
import { ComparisonSection } from './components/ComparisonSection';
import { SettingsSection } from './components/SettingsSection';

function AppInner() {
  const {
    theme,
    setTheme,
    toggleTheme,
    activeSection,
    setActiveSection,
    isSoundMuted,
    setIsSoundMuted,
    settings,
    globalStepSize,
    setGlobalStepSize,
    toast,
  } = useApp();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Live updated clock every 1 second
  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdated(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Live Tank Telemetry State
  const [liveTank, setLiveTank] = useState<LiveTankState>({
    volume: settings.initialVolume,
    capacity: settings.tankCapacity,
    inflowRate: settings.inflowRate,
    outflowRate: settings.outflowRate,
    pumpOn: true,
    timeElapsed: 0,
    isRunning: false,
    speed: settings.simSpeed || 1,
    manualOverride: false,
    alerts: [
      {
        id: 'init-1',
        timestamp: new Date().toLocaleTimeString(),
        simTime: 0,
        type: 'INFO',
        message: 'System Initialized. Automatic Hysteresis Valve Active.',
      },
    ],
    history: [
      {
        time: 0,
        volume: settings.initialVolume,
        percentage: (settings.initialVolume / settings.tankCapacity) * 100,
        pump: 1,
        inflow: settings.inflowRate,
        outflow: settings.outflowRate,
      },
    ],
  });

  // Keep liveTank capacity in sync when settings change
  useEffect(() => {
    setLiveTank((prev) => ({
      ...prev,
      capacity: settings.tankCapacity,
      inflowRate: settings.inflowRate,
      outflowRate: settings.outflowRate,
      speed: settings.simSpeed || prev.speed,
    }));
  }, [settings.tankCapacity, settings.inflowRate, settings.outflowRate, settings.simSpeed]);

  // Sync ambient pump sound
  useEffect(() => {
    soundFx.updatePumpSound(liveTank.pumpOn && liveTank.isRunning);
  }, [liveTank.pumpOn, liveTank.isRunning, isSoundMuted]);

  // Live Tank Simulation Loop with Dual-Threshold Hysteresis
  useEffect(() => {
    if (!liveTank.isRunning) return;

    const timer = setInterval(() => {
      setLiveTank((prev) => {
        const dt = 0.05 * prev.speed;
        const nextTime = Number((prev.timeElapsed + dt).toFixed(2));
        let nextPump = prev.pumpOn;
        const newAlerts = [...prev.alerts];

        // Automatic Hysteresis Controller
        if (!prev.manualOverride) {
          if (prev.volume <= settings.pumpOnThreshold && !prev.pumpOn) {
            nextPump = true;
            soundFx.playAlertBeep(false);
            newAlerts.unshift({
              id: `on-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              simTime: nextTime,
              type: 'WARNING',
              message: `Low Threshold (<= ${settings.pumpOnThreshold}L) reached: Pump turned ON automatically.`,
            });
          } else if (prev.volume >= settings.pumpOffThreshold && prev.pumpOn) {
            nextPump = false;
            soundFx.playAlertBeep(true);
            newAlerts.unshift({
              id: `off-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              simTime: nextTime,
              type: 'INFO',
              message: `High Threshold (>= ${settings.pumpOffThreshold}L) reached: Pump turned OFF to prevent overflow.`,
            });
          }
        }

        const qIn = nextPump && prev.volume < prev.capacity ? prev.inflowRate : 0;
        const qOut =
          prev.volume > 0
            ? settings.physicsModel === 'torricelli'
              ? settings.torricelliK * Math.sqrt(prev.volume)
              : prev.outflowRate
            : 0;

        let nextVol = prev.volume + (qIn - qOut) * dt;

        if (nextVol <= 0) {
          nextVol = 0;
          nextPump = true;
        } else if (nextVol >= prev.capacity) {
          nextVol = prev.capacity;
          nextPump = false;
        }

        const nextPct = (nextVol / prev.capacity) * 100;
        return {
          ...prev,
          volume: nextVol,
          pumpOn: nextPump,
          timeElapsed: nextTime,
          alerts: newAlerts.slice(0, 20),
          history: [
            ...prev.history.slice(-179),
            {
              time: nextTime,
              volume: Number(nextVol.toFixed(2)),
              percentage: Number(nextPct.toFixed(2)),
              pump: nextPump ? 1 : 0,
              inflow: Number(qIn.toFixed(1)),
              outflow: Number(qOut.toFixed(1)),
            },
          ],
        };
      });
    }, 150);

    return () => clearInterval(timer);
  }, [
    liveTank.isRunning,
    liveTank.speed,
    settings.pumpOnThreshold,
    settings.pumpOffThreshold,
    settings.physicsModel,
    settings.torricelliK,
  ]);

  const handleResetTank = () => {
    soundFx.playClick();
    const initV = settings.initialVolume;
    setLiveTank((p) => ({
      ...p,
      volume: initV,
      pumpOn: initV <= settings.pumpOnThreshold,
      timeElapsed: 0,
      isRunning: false,
      history: [
        {
          time: 0,
          volume: initV,
          percentage: (initV / p.capacity) * 100,
          pump: 1,
          inflow: p.inflowRate,
          outflow: p.outflowRate,
        },
      ],
      alerts: [
        {
          id: `rst-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          simTime: 0,
          type: 'INFO',
          message: `Simulation reset to initial volume: ${initV} L.`,
        },
      ],
    }));
  };

  const handleToggleSound = () => {
    const unmuted = soundFx.toggleMute();
    setIsSoundMuted(!unmuted);
    if (unmuted) {
      soundFx.playClick();
    }
  };

  // Numerical Solvers Shared Parameters
  const odeParams: ODEModelParams = useMemo(() => ({
    v0: settings.initialVolume,
    duration: settings.defaultDuration,
    stepSize: globalStepSize,
    qIn: settings.inflowRate,
    qOut: settings.outflowRate,
    torricelliK: settings.torricelliK,
    model: settings.physicsModel,
  }), [settings, globalStepSize]);

  const [rootInput, setRootInput] = useState({
    targetVolume: 500,
    lowerBound: 0,
    upperBound: 80,
    initialGuess: 25,
    tolerance: settings.rootTolerance,
    maxIterations: settings.maxIterations,
  });

  const [augMatrix, setAugMatrix] = useState<number[][]>(DEFAULT_MATRIX);

  const eulerRes = useMemo(() => solveEuler(odeParams), [odeParams]);
  const modEulerRes = useMemo(() => solveModifiedEuler(odeParams), [odeParams]);
  const rk4Res = useMemo(() => solveRK4(odeParams), [odeParams]);

  const fullRootParams: RootFindingParams = useMemo(
    () => ({
      ...rootInput,
      odeParams,
    }),
    [rootInput, odeParams]
  );
  const bisectionRes = useMemo(() => solveBisection(fullRootParams), [fullRootParams]);
  const falsePosRes = useMemo(() => solveFalsePosition(fullRootParams), [fullRootParams]);
  const newtonRes = useMemo(() => solveNewtonRaphson(fullRootParams), [fullRootParams]);

  const gaussRes = useMemo(() => solveGaussianElimination(augMatrix), [augMatrix]);
  const gaussJordanRes = useMemo(() => solveGaussJordan(augMatrix), [augMatrix]);

  // Navigation Items
  const navItems = [
    { id: 'dashboard' as SectionId, label: 'Dashboard', icon: <Activity className="h-5 w-5" /> },
    { id: 'live-sim' as SectionId, label: 'Live Simulation', icon: <Droplets className="h-5 w-5" /> },
    { id: 'num-lab' as SectionId, label: 'Numerical Lab', icon: <Calculator className="h-5 w-5" /> },
    { id: 'prediction' as SectionId, label: 'Level Prediction', icon: <TrendingUp className="h-5 w-5" /> },
    { id: 'distribution' as SectionId, label: 'Water Distribution', icon: <GitBranch className="h-5 w-5" /> },
    { id: 'graphs' as SectionId, label: 'Graphs & Analysis', icon: <BarChart3 className="h-5 w-5" /> },
    { id: 'comparison' as SectionId, label: 'Method Comparison', icon: <Scale className="h-5 w-5" /> },
    { id: 'settings' as SectionId, label: 'Settings', icon: <SettingsIcon className="h-5 w-5" /> },
  ];

  const handleSelectNav = (id: SectionId) => {
    soundFx.playClick();
    setActiveSection(id);
    setIsMobileMenuOpen(false);
  };

  const isDark = theme === 'dark';
  const tankPercentage = (liveTank.volume / liveTank.capacity) * 100;

  return (
    <div className="flex h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-sans antialiased overflow-hidden">
      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: Flex column, Menu scrolls, StatusBox pinned at bottom and NEVER clipped */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col justify-between w-64 md:w-20 lg:w-64 border-r border-[var(--border)] bg-[var(--bg-surface)] transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Sidebar navigation"
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo Brand Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[var(--accent)] rounded-xl flex items-center justify-center text-white shadow-md shrink-0">
                <Droplets className="h-6 w-6" />
              </div>
              <div className="hidden lg:block">
                <h2 className="font-bold text-base leading-tight text-[var(--text-primary)]">
                  Water Tank
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">Monitoring &amp; SCADA</p>
              </div>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
              aria-label="Close navigation drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Navigation Menu */}
          <nav className="p-3 lg:p-4 space-y-1.5 overflow-y-auto flex-1" role="navigation" aria-label="Main Navigation">
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectNav(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`w-full relative flex items-center gap-3.5 px-3.5 py-3 rounded-lg text-sm transition-all text-left cursor-pointer group ${
                    active
                      ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-bold border border-[var(--accent)]/30 shadow-xs'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                  title={item.label}
                >
                  {/* Left Accent Bar for Active State */}
                  {active && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[var(--accent)] rounded-r"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`transition-colors shrink-0 ${
                      active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Pinned StatusBox at Bottom (Never clipped, consistent on all pages) */}
        <div className="p-3 lg:p-4 m-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/60 text-xs space-y-2 shrink-0">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-[var(--text-secondary)] hidden lg:inline">System Status:</span>
            <span className="flex items-center gap-1.5 font-bold mx-auto lg:mx-0">
              <span className={`w-2 h-2 rounded-full ${liveTank.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className="hidden lg:inline text-[var(--text-primary)]">
                {liveTank.isRunning ? 'Active Sim' : 'Standby'}
              </span>
            </span>
          </div>

          <div className="hidden lg:flex justify-between text-[11px]">
            <span className="text-[var(--text-secondary)]">Tank Volume:</span>
            <span className="font-bold text-[var(--accent)] font-mono">
              {liveTank.volume.toFixed(1)} L ({tankPercentage.toFixed(0)}%)
            </span>
          </div>

          <div className="hidden lg:flex justify-between text-[11px] pt-1 border-t border-[var(--border)]/50">
            <span className="text-[var(--text-secondary)]">Valve / Pump:</span>
            <span className={`font-mono font-bold ${liveTank.pumpOn ? 'text-emerald-500' : 'text-slate-400'}`}>
              {liveTank.pumpOn ? `ON (${settings.inflowRate} L/min)` : 'OFF (0 L/min)'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Header with Live Clock & Controls */}
        <header className="px-4 sm:px-6 py-3.5 border-b border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur-md flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-lg border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-[var(--text-primary)]">
                Smart Water Tank Dashboard
              </h1>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                Last updated: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <button
              onClick={() => {
                soundFx.playClick();
                setLastUpdated(new Date());
              }}
              className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--text-primary)] transition cursor-pointer"
              title="Refresh Telemetry timestamp"
              aria-label="Refresh telemetry timestamp"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {/* Print / Save PDF Button */}
            <button
              onClick={() => window.print()}
              className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent)] text-[var(--text-primary)] transition cursor-pointer"
              title="Print / Save PDF (Landscape)"
              aria-label="Print or save as PDF"
            >
              <Printer className="h-4 w-4" />
            </button>

            {/* Audio Toggle */}
            <button
              onClick={handleToggleSound}
              className={`p-2 rounded-lg border text-xs transition cursor-pointer ${
                !isSoundMuted
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] font-semibold'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              title={isSoundMuted ? 'Unmute Audio' : 'Mute Audio'}
              aria-label="Toggle sound"
            >
              {!isSoundMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={() => {
                soundFx.playClick();
                toggleTheme();
              }}
              className="p-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--accent)] transition cursor-pointer"
              title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
              aria-label="Toggle theme mode"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-600" />}
            </button>
          </div>
        </header>

        {/* Section Router Container with Max-Width Constraint */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto">
          {activeSection === 'dashboard' && (
            <DashboardSection
              liveTank={liveTank}
              setLiveTank={setLiveTank}
              settings={settings}
              onResetTank={handleResetTank}
              rk4Res={rk4Res}
              newtonRes={newtonRes}
              gaussJordanRes={gaussJordanRes}
              onNavigate={(sec) => setActiveSection(sec)}
            />
          )}

          {activeSection === 'live-sim' && (
            <LiveSimSection
              liveTank={liveTank}
              setLiveTank={setLiveTank}
              settings={settings}
              onResetTank={handleResetTank}
            />
          )}

          {activeSection === 'num-lab' && (
            <NumLabSection
              odeParams={odeParams}
              setOdeParams={() => {}}
              eulerRes={eulerRes}
              modEulerRes={modEulerRes}
              rk4Res={rk4Res}
              rootInput={rootInput}
              setRootInput={setRootInput}
              bisectionRes={bisectionRes}
              falsePosRes={falsePosRes}
              newtonRes={newtonRes}
              augMatrix={augMatrix}
              setAugMatrix={setAugMatrix}
              gaussRes={gaussRes}
              gaussJordanRes={gaussJordanRes}
            />
          )}

          {activeSection === 'prediction' && (
            <PredictionSection baseOdeParams={odeParams} />
          )}

          {activeSection === 'distribution' && (
            <DistributionSection />
          )}

          {activeSection === 'graphs' && (
            <GraphsSection
              baseOdeParams={odeParams}
              globalStepSize={globalStepSize}
              onStepSizeChange={setGlobalStepSize}
            />
          )}

          {activeSection === 'comparison' && (
            <ComparisonSection
              baseOdeParams={odeParams}
              globalStepSize={globalStepSize}
              onStepSizeChange={setGlobalStepSize}
            />
          )}

          {activeSection === 'settings' && (
            <SettingsSection />
          )}
        </main>
      </div>

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed top-18 right-6 z-50 bg-[var(--bg-surface)] border border-emerald-500/50 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-2 text-xs font-semibold text-emerald-500 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}

export default App;
