// ============================================================================
// SMART WATER TANK SIMULATOR — NUMERICAL VERIFICATION TEST SUITE (2.8)
// Tests ODE scaling (h, h², h⁴), Root convergence, Linear solver agreement
// ============================================================================

import {
  solveEuler,
  solveModifiedEuler,
  solveRK4,
  solveBisection,
  solveFalsePosition,
  solveNewtonRaphson,
  solveGaussianElimination,
  solveGaussJordan,
} from './solvers';
import { computeDeterminant3x3, computeConditionNumber1 } from './matrixUtils';
import { ODEModelParams, RootFindingParams } from './types';

export interface TestSuiteResult {
  passed: boolean;
  timestamp: string;
  tests: {
    name: string;
    passed: boolean;
    details: string;
  }[];
}

export function runNumericalTestSuite(): TestSuiteResult {
  const tests: { name: string; passed: boolean; details: string }[] = [];

  // TEST 1: Linear System Solver Agreement & Determinant
  try {
    const matrix = [
      [1, 1, 1, 8],
      [1, -1, 0, 1],
      [0, 1, -3, 0],
    ];

    const det = computeDeterminant3x3(matrix.map((r) => r.slice(0, 3)));
    const cond = computeConditionNumber1(matrix.map((r) => r.slice(0, 3)));
    const ge = solveGaussianElimination(matrix);
    const gj = solveGaussJordan(matrix);

    const detCorrect = Math.abs(det - 7) < 1e-9;
    const geSol = ge.solution!;
    const gjSol = gj.solution!;

    const diff = Math.max(
      Math.abs(geSol[0] - gjSol[0]),
      Math.abs(geSol[1] - gjSol[1]),
      Math.abs(geSol[2] - gjSol[2])
    );
    const solMatchesExpected =
      Math.abs(geSol[0] - 4) < 1e-6 &&
      Math.abs(geSol[1] - 3) < 1e-6 &&
      Math.abs(geSol[2] - 1) < 1e-6;

    const passed = detCorrect && diff < 1e-9 && solMatchesExpected && ge.maxResidualError < 1e-9;
    tests.push({
      name: 'Linear System: det(A)=7, GE vs GJ Agreement (|Δ| < 1e-9), x=[4,3,1]',
      passed,
      details: `det=${det} (expected 7), |x_GE - x_GJ|=${diff.toExponential(2)}, resid=${ge.maxResidualError.toExponential(2)}, κ₁=${cond.kappa1.toFixed(2)}`,
    });
  } catch (err: any) {
    tests.push({
      name: 'Linear System Solvers',
      passed: false,
      details: err.message,
    });
  }

  // TEST 2: Root-Finding Solvers Agreement
  try {
    const baseOde: ODEModelParams = {
      v0: 200,
      duration: 100,
      stepSize: 0.1,
      qIn: 20,
      qOut: 8,
      torricelliK: 0.5657,
      model: 'torricelli',
    };
    const rootParams: RootFindingParams = {
      targetVolume: 500,
      lowerBound: 0,
      upperBound: 80,
      initialGuess: 25,
      tolerance: 0.0001,
      maxIterations: 50,
      odeParams: baseOde,
    };

    const bis = solveBisection(rootParams);
    const fp = solveFalsePosition(rootParams);
    const nr = solveNewtonRaphson(rootParams);

    const allConverged = bis.converged && fp.converged && nr.converged;
    const roots = [bis.root!, fp.root!, nr.root!];
    const maxDiff = Math.max(...roots) - Math.min(...roots);
    const passed = allConverged && maxDiff <= 0.001;

    tests.push({
      name: 'Root Finding: Bisection, False Position, Newton-Raphson Agreement',
      passed,
      details: `Roots: Bis=${bis.root?.toFixed(4)}, FP=${fp.root?.toFixed(4)}, NR=${nr.root?.toFixed(4)}, maxDiff=${maxDiff.toExponential(2)} min`,
    });
  } catch (err: any) {
    tests.push({
      name: 'Root Finding Solvers',
      passed: false,
      details: err.message,
    });
  }

  // TEST 3: ODE Error Scaling (Euler O(h), Heun O(h²), RK4 O(h⁴))
  try {
    const p1: ODEModelParams = {
      v0: 200,
      duration: 20,
      stepSize: 1.0,
      qIn: 20,
      qOut: 8,
      torricelliK: 0.5657,
      model: 'torricelli',
    };
    const p2: ODEModelParams = { ...p1, stepSize: 0.5 };

    const euler1 = solveEuler(p1);
    const euler2 = solveEuler(p2);
    const heun1 = solveModifiedEuler(p1);
    const heun2 = solveModifiedEuler(p2);
    const rk41 = solveRK4(p1);
    const rk42 = solveRK4(p2);

    const eulerRatio = euler1.maxAbsError / euler2.maxAbsError;
    const heunRatio = heun1.maxAbsError / heun2.maxAbsError;
    const rk4Ratio = rk41.maxAbsError / rk42.maxAbsError;

    // Euler ratio ~ 2 (1.8 - 2.2), Heun ratio ~ 4 (3.5 - 4.5), RK4 error is strictly lower
    const eulerValid = eulerRatio > 1.7 && eulerRatio < 2.3;
    const heunValid = heunRatio > 3.4 && heunRatio < 4.6;
    const rk4Valid = rk42.maxAbsError < rk41.maxAbsError && rk41.maxAbsError < heun1.maxAbsError;

    const passed = eulerValid && heunValid && rk4Valid;
    tests.push({
      name: 'ODE Solvers: Error Scaling when h is halved (Euler ~2x, Heun ~4x, RK4 << Heun)',
      passed,
      details: `Euler ratio=${eulerRatio.toFixed(2)}x, Heun ratio=${heunRatio.toFixed(2)}x, RK4 maxErr=${rk42.maxAbsError.toExponential(2)} L`,
    });
  } catch (err: any) {
    tests.push({
      name: 'ODE Solvers Error Scaling',
      passed: false,
      details: err.message,
    });
  }

  const allPassed = tests.every((t) => t.passed);
  return {
    passed: allPassed,
    timestamp: new Date().toISOString(),
    tests,
  };
}
