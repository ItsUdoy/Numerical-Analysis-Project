import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';

export interface ScadaWaterTankProps {
  volume: number;
  capacity: number;
  inflowRate: number;
  outflowRate: number;
  pumpOn: boolean;
  isRunning: boolean;
  pumpOnThreshold: number;
  pumpOffThreshold: number;
  onVolumeChange?: (newVolume: number) => void;
  className?: string;
}

export const ScadaWaterTank: React.FC<ScadaWaterTankProps> = ({
  volume,
  capacity,
  inflowRate,
  outflowRate,
  pumpOn,
  isRunning,
  pumpOnThreshold,
  pumpOffThreshold,
  onVolumeChange,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  // Check prefers-reduced-motion media query
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Geometry dimensions in SVG coordinate space
  const svgWidth = 500;
  const svgHeight = 360;
  const tankLeft = 145;
  const tankWidth = 180;
  const tankTopY = 55;
  const tankBottomY = 305;
  const maxWaterHeight = tankBottomY - tankTopY; // 250px

  const safeCap = Math.max(10, capacity);
  const clampedVol = Math.max(0, Math.min(safeCap, volume));
  const percentage = (clampedVol / safeCap) * 100;

  // Water level Y coordinate
  const waterHeight = Math.max(0, (percentage / 100) * maxWaterHeight);
  const waterY = tankBottomY - waterHeight;

  // Threshold Y positions
  const onLineY = tankBottomY - Math.min(1, Math.max(0, pumpOnThreshold / safeCap)) * maxWaterHeight;
  const offLineY = tankBottomY - Math.min(1, Math.max(0, pumpOffThreshold / safeCap)) * maxWaterHeight;

  // Flow states
  const activeInflow = pumpOn && isRunning && inflowRate > 0 && clampedVol < safeCap;
  const activeOutflow = isRunning && outflowRate > 0 && clampedVol > 0;
  const netFlow = (activeInflow ? inflowRate : 0) - (activeOutflow ? outflowRate : 0);
  const currentFlow = Math.abs(netFlow);

  // Dynamic pipe thickness and particle speed proportional to flow rate
  const inletThickness = Math.min(14, Math.max(8, 8 + (inflowRate / 25) * 6));
  const outletThickness = Math.min(14, Math.max(8, 8 + (outflowRate / 25) * 6));
  const inletDuration = Math.max(0.25, 0.75 - Math.min(0.5, (inflowRate / 25) * 0.45));
  const outletDuration = Math.max(0.25, 0.75 - Math.min(0.5, (outflowRate / 25) * 0.45));

  // Pump status state
  const pumpStatus: 'RUNNING' | 'READY' | 'OFF' = isRunning && pumpOn
    ? 'RUNNING'
    : pumpOn
    ? 'READY'
    : 'OFF';

  // Wave dynamics: Amplitude & speed scale with flow rate; go flat when not running or reduced motion
  const waveAmplitude = !isRunning || reducedMotion
    ? 0
    : Math.min(6, Math.max(2, 2.5 + currentFlow * 0.12));

  const waveDuration = !isRunning || reducedMotion
    ? 0
    : Math.max(1.3, 3.2 - Math.min(1.8, currentFlow * 0.08));

  // Seamless 2x-width sine waves (loop length = 180px, exactly tankWidth)
  // Generating two continuous periods (0 to 360px):
  const wavePathFront = useMemo(() => {
    if (waveAmplitude <= 0.1) {
      return `M 0 0 L 360 0 L 360 260 L 0 260 Z`;
    }
    const a = waveAmplitude;
    return `
      M 0 0
      Q 45 ${-a} 90 0
      T 180 0
      T 270 0
      T 360 0
      L 360 260
      L 0 260
      Z
    `;
  }, [waveAmplitude]);

  const wavePathBack = useMemo(() => {
    if (waveAmplitude <= 0.1) {
      return `M 0 0 L 360 0 L 360 260 L 0 260 Z`;
    }
    const a = waveAmplitude * 0.75;
    return `
      M 0 0
      Q 45 ${a} 90 0
      T 180 0
      T 270 0
      T 360 0
      L 360 260
      L 0 260
      Z
    `;
  }, [waveAmplitude]);

  // Click & Drag calculation on the tank body
  const updateVolumeFromClientY = useCallback(
    (clientY: number) => {
      if (!onVolumeChange || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scaleY = svgHeight / rect.height;
      const clickSvgY = (clientY - rect.top) * scaleY;
      const relativeY = Math.max(tankTopY, Math.min(tankBottomY, clickSvgY));
      const fraction = 1 - (relativeY - tankTopY) / maxWaterHeight;
      const targetVolume = Math.round(fraction * safeCap);
      onVolumeChange(Math.max(0, Math.min(safeCap, targetVolume)));
    },
    [onVolumeChange, safeCap, maxWaterHeight, tankTopY, tankBottomY, svgHeight]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onVolumeChange) return;
    setIsDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
    updateVolumeFromClientY(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateVolumeFromClientY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as Element).releasePointerCapture(e.pointerId);
      } catch {
        // ignore if not captured
      }
    }
  };

  // Keyboard accessibility handler (ArrowUp / ArrowDown)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!onVolumeChange) return;
    const step = e.shiftKey ? 50 : 10;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      onVolumeChange(Math.min(safeCap, clampedVol + step));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onVolumeChange(Math.max(0, clampedVol - step));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      onVolumeChange(Math.min(safeCap, clampedVol + 100));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      onVolumeChange(Math.max(0, clampedVol - 100));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onVolumeChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onVolumeChange(safeCap);
    }
  };

  // Alert border states
  const isCriticalLow = percentage < 10;
  const isCriticalHigh = percentage >= 98;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="slider"
      aria-label="Water tank level adjustment"
      aria-valuenow={Math.round(clampedVol)}
      aria-valuemin={0}
      aria-valuemax={safeCap}
      aria-valuetext={`${Math.round(clampedVol)} Liters, ${percentage.toFixed(1)} percent`}
      onKeyDown={handleKeyDown}
      className={`relative flex flex-col items-center justify-center p-2 rounded-xl transition-all outline-none select-none ${
        isCriticalLow
          ? 'ring-2 ring-rose-500/80 bg-rose-50/20 dark:bg-rose-950/20 animate-pulse'
          : isCriticalHigh
          ? 'ring-2 ring-amber-500/80 bg-amber-50/20 dark:bg-amber-950/20'
          : 'focus:ring-2 focus:ring-blue-500/50'
      } ${className}`}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full max-w-[490px] h-auto drop-shadow-md overflow-visible cursor-ns-resize"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <defs>
          {/* Depth gradient: lighter sky at surface, deep abyssal blue at bottom */}
          <linearGradient id="scadaWaterDepthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
            <stop offset="15%" stopColor="#0284c7" stopOpacity="0.92" />
            <stop offset="65%" stopColor="#0369a1" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0.98" />
          </linearGradient>

          {/* Secondary background wave gradient */}
          <linearGradient id="scadaWaterBackGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#0284c7" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#0c4a6e" stopOpacity="0.75" />
          </linearGradient>

          {/* Realistic metallic pipe gradient */}
          <linearGradient id="scadaPipeMetalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="35%" stopColor="#64748b" />
            <stop offset="70%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          {/* Glass specular cylinder highlights */}
          <linearGradient id="scadaGlassWallGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.95" />
            <stop offset="6%" stopColor="#64748b" stopOpacity="0.7" />
            <stop offset="14%" stopColor="#94a3b8" stopOpacity="0.25" />
            <stop offset="25%" stopColor="#0f172a" stopOpacity="0.05" />
            <stop offset="75%" stopColor="#0f172a" stopOpacity="0.05" />
            <stop offset="86%" stopColor="#94a3b8" stopOpacity="0.25" />
            <stop offset="94%" stopColor="#64748b" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1e293b" stopOpacity="0.95" />
          </linearGradient>

          {/* Moving glass reflection shimmer */}
          <linearGradient id="scadaMovingReflection" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Vertical Tank Interior Clip */}
          <clipPath id="scadaTankClip">
            <rect x={tankLeft} y={tankTopY} width={tankWidth} height={maxWaterHeight} rx="8" />
          </clipPath>
        </defs>

        {/* =====================================================================
            1. BASE PEDESTAL & SHADOW
            ===================================================================== */}
        <ellipse cx="235" cy="336" rx="130" ry="10" fill="#020617" opacity="0.35" filter="blur(5px)" />
        <rect x="130" y="312" width="210" height="10" rx="3" fill="#0f172a" stroke="#334155" strokeWidth="1.5" />
        <rect x="120" y="322" width="230" height="8" rx="2" fill="#1e293b" stroke="#475569" strokeWidth="1" />

        {/* =====================================================================
            2. SLIM VERTICAL ZONE GAUGE ON THE LEFT (Labels >= 12px outside tank)
            ===================================================================== */}
        {/* Zone title */}
        <text
          x="110"
          y="42"
          textAnchor="end"
          className="text-[11px] font-mono uppercase tracking-wider fill-gray-500 dark:fill-slate-400 font-semibold"
        >
          Zone Limits
        </text>

        {/* Slim Zone Gauge Bar (X: 118, width: 8px) */}
        <g>
          {/* High Zone: above pumpOffThreshold (amber/red) */}
          <rect
            x="118"
            y={tankTopY}
            width="8"
            height={Math.max(0, offLineY - tankTopY)}
            fill="#ef4444"
            opacity="0.85"
            rx="2"
          />

          {/* Normal Zone: pumpOnThreshold to pumpOffThreshold (blue) */}
          <rect
            x="118"
            y={offLineY}
            width="8"
            height={Math.max(0, onLineY - offLineY)}
            fill="#3b82f6"
            opacity="0.9"
          />

          {/* Low Zone: 0 to pumpOnThreshold (amber) */}
          <rect
            x="118"
            y={onLineY}
            width="8"
            height={Math.max(0, tankBottomY - onLineY)}
            fill="#f59e0b"
            opacity="0.85"
            rx="2"
          />
        </g>

        {/* High Cutoff Label (min 12px) */}
        <g>
          <line x1="114" y1={offLineY} x2="126" y2={offLineY} stroke="#ef4444" strokeWidth="2" />
          <text
            x="110"
            y={offLineY + 4}
            textAnchor="end"
            className="text-xs font-mono font-bold fill-red-600 dark:fill-red-400"
          >
            High: {pumpOffThreshold}L
          </text>
        </g>

        {/* Low Trigger Label (min 12px) */}
        <g>
          <line x1="114" y1={onLineY} x2="126" y2={onLineY} stroke="#f59e0b" strokeWidth="2" />
          <text
            x="110"
            y={onLineY + 4}
            textAnchor="end"
            className="text-xs font-mono font-bold fill-amber-600 dark:fill-amber-400"
          >
            Low: {pumpOnThreshold}L
          </text>
        </g>

        {/* =====================================================================
            3. INLET PIPE NETWORK & CENTRIFUGAL PUMP
            ===================================================================== */}
        {/* Metal Pipe Body */}
        <path
          d="M 15 32 L 180 32 L 180 58"
          fill="none"
          stroke="url(#scadaPipeMetalGrad)"
          strokeWidth={inletThickness + 6}
          strokeLinecap="round"
        />
        <path
          d="M 15 32 L 180 32 L 180 58"
          fill="none"
          stroke="#0f172a"
          strokeWidth={inletThickness + 2}
          strokeLinecap="round"
        />

        {/* Animated Fluid Stream inside Pipe */}
        <path
          d="M 15 32 L 180 32 L 180 58"
          fill="none"
          stroke={activeInflow ? '#38bdf8' : '#1e293b'}
          strokeWidth={inletThickness}
          strokeDasharray={activeInflow ? '8 6' : 'none'}
        >
          {activeInflow && !reducedMotion && (
            <animate
              attributeName="stroke-dashoffset"
              from="28"
              to="0"
              dur={`${inletDuration}s`}
              repeatCount="indefinite"
            />
          )}
        </path>

        {/* Flanges */}
        <rect x="75" y="24" width="6" height="16" rx="1" fill="#475569" stroke="#64748b" strokeWidth="1" />
        <rect x="172" y="48" width="16" height="6" rx="1" fill="#475569" stroke="#64748b" strokeWidth="1" />

        {/* Centrifugal Pump Unit */}
        <g transform="translate(38, 12)">
          <circle
            cx="20"
            cy="20"
            r="20"
            fill="#090d16"
            stroke={pumpStatus === 'RUNNING' ? '#10b981' : pumpStatus === 'READY' ? '#0ea5e9' : '#475569'}
            strokeWidth="2.5"
          />
          <circle cx="20" cy="20" r="16" fill="#0f172a" />

          {/* Rotating Impeller Blades (spins when RUNNING) */}
          <g>
            <circle
              cx="20"
              cy="20"
              r="4.5"
              fill={pumpStatus === 'RUNNING' ? '#34d399' : pumpStatus === 'READY' ? '#38bdf8' : '#64748b'}
            />
            <line
              x1="20"
              y1="6"
              x2="20"
              y2="34"
              stroke={pumpStatus === 'RUNNING' ? '#10b981' : pumpStatus === 'READY' ? '#0ea5e9' : '#64748b'}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="6"
              y1="20"
              x2="34"
              y2="20"
              stroke={pumpStatus === 'RUNNING' ? '#10b981' : pumpStatus === 'READY' ? '#0ea5e9' : '#64748b'}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {pumpStatus === 'RUNNING' && !reducedMotion && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 20 20"
                to="360 20 20"
                dur="0.5s"
                repeatCount="indefinite"
              />
            )}
          </g>

          {/* Pump State Label (RUNNING / READY / OFF) */}
          <text
            x="20"
            y="52"
            textAnchor="middle"
            className={`text-[10px] font-mono font-bold tracking-wider ${
              pumpStatus === 'RUNNING'
                ? 'fill-emerald-500 dark:fill-emerald-400'
                : pumpStatus === 'READY'
                ? 'fill-sky-500 dark:fill-sky-400'
                : 'fill-slate-400'
            }`}
          >
            PUMP: {pumpStatus}
          </text>
        </g>

        {/* =====================================================================
            4. TANK VESSEL & FLUID WITH SEAMLESS SINE WAVES
            ===================================================================== */}
        {/* Tank Vessel Background */}
        <rect
          x={tankLeft}
          y={tankTopY}
          width={tankWidth}
          height={maxWaterHeight}
          rx="8"
          fill="#070c18"
          stroke="#1e293b"
          strokeWidth="1.5"
        />

        {/* Light Shading of Hysteresis Band (200L to 900L) */}
        <rect
          x={tankLeft}
          y={offLineY}
          width={tankWidth}
          height={Math.max(0, onLineY - offLineY)}
          fill="#3b82f6"
          fillOpacity="0.06"
        />

        {/* Clipped Fluid Region */}
        <g clipPath="url(#scadaTankClip)">
          {/* Inflow Waterfall Stream */}
          {activeInflow && (
            <g>
              <rect
                x="176"
                y="55"
                width="8"
                height={Math.max(0, waterY - 55)}
                fill="url(#scadaWaterDepthGrad)"
                opacity="0.9"
              />
              <rect
                x="179"
                y="55"
                width="2.5"
                height={Math.max(0, waterY - 55)}
                fill="#ffffff"
                opacity="0.65"
              />
              {/* Impact Surface Ripples */}
              {waterY > 60 && !reducedMotion && (
                <g transform={`translate(180, ${waterY})`}>
                  <circle cx="0" cy="0" r="8" fill="none" stroke="#38bdf8" strokeWidth="1.5">
                    <animate attributeName="r" from="2" to="16" dur="0.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.9" to="0" dur="0.6s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="-5" cy="-2" r="1.5" fill="#ffffff" opacity="0.8">
                    <animate attributeName="cy" from="-2" to="-8" dur="0.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.9" to="0" dur="0.4s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="5" cy="-2" r="2" fill="#ffffff" opacity="0.8">
                    <animate attributeName="cy" from="-2" to="-10" dur="0.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" repeatCount="indefinite" />
                  </circle>
                </g>
              )}
            </g>
          )}

          {/* Secondary Back Wave (Phase shifted) */}
          {clampedVol > 0 && (
            <g transform={`translate(${tankLeft}, ${waterY})`}>
              <path
                d={wavePathBack}
                fill="url(#scadaWaterBackGrad)"
                style={{ transition: 'd 150ms ease-out' }}
              >
                {isRunning && !reducedMotion && waveDuration > 0 && (
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    from="0 0"
                    to="-180 0"
                    dur={`${waveDuration * 1.3}s`}
                    repeatCount="indefinite"
                  />
                )}
              </path>
            </g>
          )}

          {/* Primary Front Fluid Body with Seamless Meniscus Wave & Depth Gradient */}
          {clampedVol > 0 && (
            <g transform={`translate(${tankLeft}, ${waterY})`}>
              <path
                d={wavePathFront}
                fill="url(#scadaWaterDepthGrad)"
                style={{ transition: 'd 150ms ease-out' }}
              >
                {isRunning && !reducedMotion && waveDuration > 0 && (
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    from="0 0"
                    to="-180 0"
                    dur={`${waveDuration}s`}
                    repeatCount="indefinite"
                  />
                )}
              </path>
            </g>
          )}

          {/* Rising Micro-Bubbles */}
          {isRunning && !reducedMotion && clampedVol > 40 && (
            <g opacity="0.6">
              <circle cx={tankLeft + 35} cy={tankBottomY - 15} r="2" fill="#e0f2fe">
                <animate attributeName="cy" from={tankBottomY - 10} to={waterY} dur="2.1s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.8" to="0" dur="2.1s" repeatCount="indefinite" />
              </circle>
              <circle cx={tankLeft + 85} cy={tankBottomY - 25} r="3" fill="#e0f2fe">
                <animate attributeName="cy" from={tankBottomY - 10} to={waterY} dur="1.7s" begin="0.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.8" to="0" dur="1.7s" begin="0.4s" repeatCount="indefinite" />
              </circle>
              <circle cx={tankLeft + 145} cy={tankBottomY - 20} r="2.2" fill="#e0f2fe">
                <animate attributeName="cy" from={tankBottomY - 10} to={waterY} dur="2.4s" begin="0.9s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.8" to="0" dur="2.4s" begin="0.9s" repeatCount="indefinite" />
              </circle>
            </g>
          )}

          {/* Moving Glass Reflection across the fluid */}
          <rect x={tankLeft} y={tankTopY} width="35" height={maxWaterHeight} fill="url(#scadaMovingReflection)" opacity="0.35">
            {isRunning && !reducedMotion && (
              <animate
                attributeName="x"
                from={tankLeft - 40}
                to={tankLeft + tankWidth + 40}
                dur="4.5s"
                repeatCount="indefinite"
              />
            )}
          </rect>
        </g>

        {/* Glass Cylindrical Bezel & Specular Highlights */}
        <rect
          x={tankLeft}
          y={tankTopY}
          width={tankWidth}
          height={maxWaterHeight}
          rx="8"
          fill="url(#scadaGlassWallGrad)"
          stroke="#475569"
          strokeWidth="2"
          pointerEvents="none"
        />

        {/* Top & Bottom Metallic Collar Caps */}
        <rect
          x={tankLeft - 4}
          y={tankTopY - 6}
          width={tankWidth + 8}
          height="8"
          rx="2"
          fill="url(#scadaPipeMetalGrad)"
          stroke="#64748b"
          strokeWidth="1"
        />
        <rect
          x={tankLeft - 4}
          y={tankBottomY - 2}
          width={tankWidth + 8}
          height="8"
          rx="2"
          fill="url(#scadaPipeMetalGrad)"
          stroke="#64748b"
          strokeWidth="1"
        />

        {/* =====================================================================
            5. WATERLINE POINTER (Arrow + Current Volume Badge that follows level)
            ===================================================================== */}
        <g style={{ transition: 'transform 150ms ease-out' }}>
          {/* Arrow pointing at the water surface */}
          <polygon
            points={`328,${waterY} 336,${waterY - 5} 336,${waterY + 5}`}
            fill="#0284c7"
            className="drop-shadow-sm"
          />

          {/* Volume Badge following the waterline */}
          <g transform={`translate(338, ${Math.max(tankTopY, Math.min(tankBottomY - 24, waterY - 12))})`}>
            <rect
              x="0"
              y="0"
              width="78"
              height="24"
              rx="6"
              fill="#0b1120"
              stroke="#0284c7"
              strokeWidth="1.5"
              className="drop-shadow-md"
            />
            <text
              x="39"
              y="16"
              textAnchor="middle"
              className="text-xs font-mono font-bold fill-cyan-300 tracking-wider"
            >
              {clampedVol.toFixed(1)} L
            </text>
          </g>
        </g>

        {/* Measurement Scale Graduation Ticks on the Right Rim */}
        {[0, 25, 50, 75, 100].map((mark) => {
          const yPos = tankBottomY - (mark / 100) * maxWaterHeight;
          const isPassed = percentage >= mark;
          return (
            <g key={mark}>
              <line x1={tankLeft + tankWidth - 1} y1={yPos} x2={tankLeft + tankWidth + 6} y2={yPos} stroke="#64748b" strokeWidth="1.5" />
              <text
                x="424"
                y={yPos + 3.5}
                className={`text-[10px] font-mono ${
                  isPassed ? 'fill-blue-600 dark:fill-blue-400 font-bold' : 'fill-gray-400 dark:fill-slate-500'
                }`}
              >
                {mark}%
              </text>
            </g>
          );
        })}

        {/* =====================================================================
            6. OUTLET DISCHARGE PIPE WITH ROTATING VALVE HANDLE
            ===================================================================== */}
        {/* Metal Pipe Body */}
        <path
          d="M 325 285 L 440 285 L 440 335"
          fill="none"
          stroke="url(#scadaPipeMetalGrad)"
          strokeWidth={outletThickness + 6}
          strokeLinecap="round"
        />
        <path
          d="M 325 285 L 440 285 L 440 335"
          fill="none"
          stroke="#0f172a"
          strokeWidth={outletThickness + 2}
          strokeLinecap="round"
        />

        {/* Animated Fluid in Outlet Pipe */}
        <path
          d="M 325 285 L 440 285 L 440 335"
          fill="none"
          stroke={activeOutflow ? '#38bdf8' : '#1e293b'}
          strokeWidth={outletThickness}
          strokeDasharray={activeOutflow ? '8 6' : 'none'}
        >
          {activeOutflow && !reducedMotion && (
            <animate
              attributeName="stroke-dashoffset"
              from="28"
              to="0"
              dur={`${outletDuration}s`}
              repeatCount="indefinite"
            />
          )}
        </path>

        {/* Rotating Valve Handle (0 deg = Open / In line, 90 deg = Closed) */}
        <g transform="translate(385, 285)">
          <rect x="-4" y="-4" width="8" height="8" rx="1" fill="#475569" stroke="#64748b" strokeWidth="1" />
          <g
            transform={`rotate(${activeOutflow ? 0 : 90})`}
            style={{ transition: 'transform 300ms ease-in-out', transformOrigin: '0px 0px' }}
          >
            <rect
              x="-14"
              y="-3"
              width="28"
              height="6"
              rx="3"
              fill={activeOutflow ? '#10b981' : '#ef4444'}
              stroke="#0f172a"
              strokeWidth="1"
            />
            <circle cx="0" cy="0" r="3" fill="#ffffff" />
          </g>
          <text
            x="0"
            y="22"
            textAnchor="middle"
            className={`text-[9px] font-mono font-bold ${
              activeOutflow ? 'fill-emerald-600 dark:fill-emerald-400' : 'fill-red-500'
            }`}
          >
            VALVE: {activeOutflow ? 'OPEN' : 'CLOSED'}
          </text>
        </g>
      </svg>
    </div>
  );
};
