// ============================================================================
// SMART WATER TANK SIMULATOR — TYPES & INTERFACES (CSE-2204)
// ============================================================================

export type SectionId =
  | 'dashboard'
  | 'live-sim'
  | 'num-lab'
  | 'prediction'
  | 'distribution'
  | 'graphs'
  | 'comparison'
  | 'settings';

export type ODEPhysicsModel = 'torricelli' | 'linear';

export interface SystemSettings {
  tankCapacity: number;       // default 1000 L
  initialVolume: number;      // default 200 L
  inflowRate: number;         // default 20 L/min when pump ON
  outflowRate: number;        // default 8 L/min (or baseline drainage)
  torricelliK: number;        // default 0.5657 (yields 8 L/min at 200 L)
  physicsModel: ODEPhysicsModel;
  pumpOnThreshold: number;    // default 200 L
  pumpOffThreshold: number;   // default 900 L
  defaultStepSize: number;    // default 1.0 min
  defaultDuration: number;    // default 30 min
  rootTolerance: number;      // default 0.0001
  maxIterations: number;      // default 50
  simSpeed: number;           // default 1x
}

export interface SystemAlert {
  id: string;
  timestamp: string;
  simTime: number;
  type: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
}

export interface TankTelemetryPoint {
  time: number;
  volume: number;
  percentage: number;
  pump: number;
  inflow: number;
  outflow: number;
}

export interface LiveTankState {
  volume: number;
  capacity: number;
  inflowRate: number;
  outflowRate: number;
  pumpOn: boolean;
  timeElapsed: number;
  isRunning: boolean;
  speed: number;
  manualOverride: boolean;
  alerts: SystemAlert[];
  history: TankTelemetryPoint[];
}

export interface ODEModelParams {
  v0: number;
  duration: number;
  stepSize: number;
  qIn: number;
  qOut: number;
  torricelliK: number;
  model: ODEPhysicsModel;
}

export interface ODEStepResult {
  step: number;
  t: number;
  v: number;
  vExactRef: number;
  absError: number;
  relErrorPct: number;
  details: string;
}

export interface ODEResult {
  methodName: string;
  order: string;
  steps: ODEStepResult[];
  finalVolume: number;
  refFinalVolume: number;
  maxAbsError: number;
  meanRelError: number;
  executionTimeMs: number;
}

export interface RootFindingParams {
  targetVolume: number;
  lowerBound: number;
  upperBound: number;
  initialGuess: number;
  tolerance: number;
  maxIterations: number;
  odeParams: ODEModelParams;
}

export interface RootIteration {
  iteration: number;
  a?: number;
  b?: number;
  x: number;
  fx: number;
  dfx?: number;
  error: number;
}

export interface RootFindingResult {
  methodName: string;
  converged: boolean;
  root: number | null;
  iterations: RootIteration[];
  statusMessage: string;
  executionTimeMs: number;
}

export interface MatrixStep {
  stepIndex: number;
  operationCode: string;
  explanation: string;
  matrix: number[][];
}

export interface LinearSystemResult {
  methodName: string;
  status: 'UNIQUE' | 'SINGULAR' | 'INCONSISTENT';
  statusMessage: string;
  solution: [number, number, number] | null;
  steps: MatrixStep[];
  residuals: [number, number, number] | null;
  maxResidualError: number;
  executionTimeMs: number;
}
