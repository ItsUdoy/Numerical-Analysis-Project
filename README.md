# 🚰 Smart Water Tank Simulator & SCADA Digital Twin
### Course Project: **CSE-2204 Numerical Methods**
**Department of Computer Science & Engineering (CSE)**  
**Bangladesh University of Professionals (BUP)**

---

## 👥 Project Team Members
- **Imtiyaz Ali**
- **Md. Udoy Hossain Joy**

---

## 📑 Table of Contents
1. [Executive Overview](#-executive-overview)
2. [Physical & Mathematical Modeling](#-physical--mathematical-modeling)
3. [The 8 Numerical Methods (Academic Categorization)](#-the-8-numerical-methods-academic-categorization)
   - [Group A: Initial Value Problem (IVP) ODE Solvers](#group-a-initial-value-problem-ivp-ode-solvers)
   - [Group B: Non-Linear Root-Finding (Horizon Prediction)](#group-b-non-linear-root-finding-horizon-prediction)
   - [Group C: Linear Algebraic Systems (3-Zone Water Distribution)](#group-c-linear-algebraic-systems-3-zone-water-distribution)
4. [Project Architecture & Tech Stack](#-project-architecture--tech-stack)
5. [Directory & File Organization (Kothay Ki Ase)](#-directory--file-organization-kothay-ki-ase)
6. [Module & Feature Walkthrough (Konta Ki Kaj Kore)](#-module--feature-walkthrough-konta-ki-kaj-kore)
7. [How to Run (Kivabe Run Kore — Step by Step)](#-how-to-run-kivabe-run-kore--step-by-step)
8. [Performance & Verification Benchmarks](#-performance--verification-benchmarks)

---

## 🌟 Executive Overview
The **Smart Water Tank Simulator & SCADA Digital Twin** is an academic software suite built for the **CSE-2204 Numerical Methods** curriculum. 

Instead of treating numerical algorithms as isolated textbook formulas, this project contextualizes them within a real-world **Supervisory Control and Data Acquisition (SCADA)** cyber-physical system:
- **Real-Time Actuator Control**: Implements an industrial **Dual-Threshold Hysteresis Controller** ($\le 200\text{ L}$ Pump ON, $\ge 900\text{ L}$ Pump OFF) to protect the inflow motor against mechanical wear and rapid switching.
- **Fluid Dynamics**: Solves non-linear Torricelli gravity drainage and linear mass-balance flow models.
- **Multi-Zone Pipe Network**: Resolves manifold flow distribution using linear algebraic matrix systems.
- **Two Implementations Included**:
  1. **Full-Featured React + TypeScript SPA** (with SVG SCADA animations, Recharts, and interactive steppers).
  2. **Native Python Engine** (Flask REST API backend + NumPy/SciPy numerical algorithms + browser frontend).

---

## 📐 Physical & Mathematical Modeling

### 1. Inflow/Outflow Differential Equation
The volume of water $V(t)$ inside the vertical reservoir changes over time according to the continuity equation:

$$\frac{dV}{dt} = Q_{\text{in}}(t) - Q_{\text{out}}(V)$$

Where:
- **Torricelli's Law Model (Gravity-driven orifice flow)**:
  $$Q_{\text{out}}(V) = k \cdot \sqrt{V} \quad \implies \quad \frac{dV}{dt} = Q_{\text{in}} - k\sqrt{V}$$
  *(where $k = C_d A_o \sqrt{2g / A_{\text{tank}}}$ is the effective discharge coefficient)*
- **Linear Outflow Model (Constant rate extraction)**:
  $$\frac{dV}{dt} = Q_{\text{in}} - Q_{\text{out}}$$

### 2. Dual-Threshold Hysteresis Controller
To prevent pump chattering (rapid on-off cycling around a single setpoint):
- If $V(t) \le 200\text{ L}$, the inflow pump engages: $Q_{\text{in}} = 20\text{ L/min}$.
- If $V(t) \ge 900\text{ L}$, the inflow pump cuts off: $Q_{\text{in}} = 0\text{ L/min}$.
- If $200\text{ L} < V(t) < 900\text{ L}$, the pump maintains its previous state (hysteresis deadband).

### 3. Arrival Horizon Formulation (Root-Finding)
To determine the exact minute $t^*$ when the tank volume reaches a user-specified target $V_{\text{target}}$:
$$g(t) = V(t) - V_{\text{target}} = 0$$
Using the Fundamental Theorem of Calculus, the exact derivative needed for Newton-Raphson is:
$$g'(t) = \frac{dV}{dt}(t) = Q_{\text{in}}(t) - Q_{\text{out}}(V(t))$$

### 4. 3-Zone Manifold Distribution (Linear System)
Water leaving the main tank outlet ($Q_{\text{out}}$) splits through a manifold into three municipal zones ($x = q_A, y = q_B, z = q_C$):
1. **Total Mass Conservation**: $x + y + z = Q_{\text{out}}$
2. **Zone Differential Constraint**: $x - y = d$ (Zone 1 requires $d\text{ L/min}$ more flow than Zone 2)
3. **Branch Hydraulic Ratio**: $y - r \cdot z = 0$ (Zone 2 flow is $r \times$ Zone 3)

In matrix form $Ax = b$:
$$\begin{bmatrix} 1 & 1 & 1 \\ 1 & -1 & 0 \\ 0 & 1 & -r \end{bmatrix} \begin{bmatrix} x \\ y \\ z \end{bmatrix} = \begin{bmatrix} Q_{\text{out}} \\ d \\ 0 \end{bmatrix}$$

- **Laplace Expansion Determinant**: $\det(A) = 2r + 1$ (for default $r = 3$, $\det(A) = 7 \ne 0$, guaranteeing a unique physical solution).
- **Condition Number**: $\|A\|_1 \cdot \|A^{-1}\|_1 \approx 4.57$ (Well-conditioned system).

---

## 🧮 The 8 Numerical Methods (Academic Categorization)

### Group A: Initial Value Problem (IVP) ODE Solvers
Used to integrate $\frac{dV}{dt}$ from $t = 0$ to $t = T$ given $V(0) = V_0$.

1. **Forward Euler Method**
   - **Formula**: $V_{n+1} = V_n + h \cdot f(t_n, V_n)$
   - **Order**: First-Order $O(h)$ Global, $O(h^2)$ Local Truncation Error.
   - **Stability Region**: Real-axis interval $(-2, 0)$, stable when $h < \frac{2}{|\lambda|}$.
   - **Characteristics**: Fast single-step evaluation, but accumulates significant truncation drift for large $h$.

2. **Modified Euler / Heun's Method**
   - **Formula**:
     $$\tilde{V}_{n+1} = V_n + h \cdot f(t_n, V_n) \quad \text{(Predictor)}$$
     $$V_{n+1} = V_n + \frac{h}{2} \left[ f(t_n, V_n) + f(t_{n+1}, \tilde{V}_{n+1}) \right] \quad \text{(Corrector)}$$
   - **Order**: Second-Order $O(h^2)$ Global, $O(h^3)$ Local Truncation Error.
   - **Stability Region**: Real-axis interval $(-2, 0)$.
   - **Characteristics**: Evaluates derivative twice per step; cancels out linear curvature drift.

3. **Runge-Kutta 4th Order (RK4)**
   - **Formula**:
     $$k_1 = f(t_n, V_n), \quad k_2 = f\left(t_n + \frac{h}{2}, V_n + \frac{h}{2}k_1\right)$$
     $$k_3 = f\left(t_n + \frac{h}{2}, V_n + \frac{h}{2}k_2\right), \quad k_4 = f(t_n + h, V_n + h k_3)$$
     $$V_{n+1} = V_n + \frac{h}{6} (k_1 + 2k_2 + 2k_3 + k_4)$$
   - **Order**: Fourth-Order $O(h^4)$ Global, $O(h^5)$ Local Truncation Error.
   - **Stability Region**: Widest stability envelope $\approx (-2.78, 0)$ on real axis.
   - **Characteristics**: Industry benchmark grade; sub-milliliter precision even with $h = 1.0\text{ min}$.

---

### Group B: Non-Linear Root-Finding (Horizon Prediction)
Used to find the arrival time root $t^*$ such that $g(t^*) = V(t^*) - V_{\text{target}} = 0$.

4. **Bisection Method (Binary Chop)**
   - **Mechanism**: Evaluates midpoint $c = \frac{a + b}{2}$; replaces bracket preserving $g(a) \cdot g(c) < 0$.
   - **Convergence**: Strictly Linear ($p = 1$), error halves every step: $\varepsilon_{k+1} = 0.5 \varepsilon_k$.
   - **Theoretical Iterations**: $N = \left\lceil \frac{\ln(b_0 - a_0) - \ln(\text{tol})}{\ln 2} \right\rceil$.
   - **Characteristics**: Completely fail-safe and unconditionally guaranteed to converge.

5. **False Position (Regula Falsi)**
   - **Mechanism**: Connects bracket endpoints via secant chord: $c = \frac{a \cdot g(b) - b \cdot g(a)}{g(b) - g(a)}$.
   - **Convergence**: Linear ($p = 1$); can stagnate when one endpoint remains fixed due to convex curvature.
   - **Characteristics**: Faster than Bisection initially, but stagnation requires active monitoring.

6. **Newton-Raphson Method**
   - **Mechanism**: Uses local tangent line slope: $t_{k+1} = t_k - \frac{g(t_k)}{g'(t_k)}$, where $g'(t_k) = \frac{dV}{dt}(t_k)$.
   - **Convergence**: Quadratic ($p = 2$), doubling correct decimal digits each iteration near the root.
   - **Characteristics**: Fastest convergence (typically 3–5 iterations to achieve $< 10^{-6}\text{ L}$ tolerance).

---

### Group C: Linear Algebraic Systems (3-Zone Water Distribution)
Used to solve the distribution manifold flow rates $[x, y, z]^T$.

7. **Gaussian Elimination with Partial Pivoting**
   - **Algorithm**: Row-wise forward elimination into upper triangular matrix $U$, followed by back-substitution.
   - **Operation Count**: Textbook count $\frac{1}{3}n^3 + n^2 - \frac{1}{3}n$ multiplications/divisions ($\approx 17\text{ ops}$ for $3 \times 3$).
   - **Pivoting**: Scans column pivots to eliminate division-by-zero and suppress numerical roundoff errors.

8. **Gauss-Jordan Elimination**
   - **Algorithm**: Simultaneous forward and backward elimination transforming $[A|b]$ directly into Reduced Row Echelon Form (RREF) $[I|x]$.
   - **Operation Count**: $\frac{1}{2}n^3 + n^2 - \frac{1}{2}n$ operations ($\approx 23\text{ ops}$ for $3 \times 3$).
   - **Characteristics**: Directly produces solution vector without back-substitution; foundational for matrix inversion.

---

## 💻 Project Architecture & Tech Stack

### Modern Frontend & UI/UX Stack
- **Framework**: React 18 with TypeScript 5
- **Build Tool**: Vite 5 (instant Hot Module Replacement)
- **Styling**: Tailwind CSS 3 with strict CSS Theme Variables (`--bg-base`, `--bg-surface`, `--accent`, etc.)
- **Icons**: Lucide React
- **Visual Charts**: Recharts & Chart.js (Dual Canvas & SVG rendering with log/linear scales)
- **Audio Synthesis**: Web Audio API (real-time generated acoustic pulses for pump/valve telemetry)
- **Typography**:
  - **UI Prose**: `Plus Jakarta Sans` (weights 400, 500, 600, 700)
  - **Data / Metrics / Stepper**: `JetBrains Mono` (`font-variant-numeric: tabular-nums`)

### Python Numerical Stack (`python_app/`)
- **Backend Framework**: Python Flask 3.1 + Flask-CORS
- **Computation Core**: NumPy 2.5 + SciPy 1.18 + SymPy 1.14
- **Precision Reference Cache**: High-resolution sub-stepping ($dt = 0.01\text{ min}$) ODE memoization engine.

---

## 📁 Directory & File Organization (Kothay Ki Ase)

```text
E:\Numerical Project\SMART_WATER_TANK_SIMULATOR\
│
├── run.bat                          <-- One-click Windows launcher for React Frontend (Port 5173)
├── run_python.bat                   <-- One-click Windows launcher for Python Flask Engine (Port 5000)
├── README.md                        <-- Master Documentation (This file)
│
├── SMART_WATER_TANK_SIMULATOR/      <-- React + TypeScript Full Application
│   ├── package.json                 <-- Project dependencies & NPM scripts
│   ├── vite.config.ts               <-- Vite server configuration (port: 5173, open: true)
│   ├── tailwind.config.js           <-- Design tokens & custom color extensions
│   ├── tsconfig.json                <-- TypeScript compiler rules
│   ├── run.bat                      <-- Local project launcher (single tab open)
│   ├── CHANGELOG.md                 <-- Complete engineering changelog (Phases 1-3)
│   ├── DESIGN_SYSTEM.md             <-- UI tokens, contrast ratios, and typography rules
│   │
│   ├── src/
│   │   ├── App.tsx                  <-- Main Application Shell, Navigation Bar & Sidebar
│   │   ├── index.css                <-- CSS custom properties (Dark/Light mode tokens)
│   │   ├── main.tsx                 <-- React DOM root entry point
│   │   │
│   │   ├── context/
│   │   │   └── AppContext.tsx       <-- Centralized Single Source of Truth Store
│   │   │
│   │   ├── utils/
│   │   │   ├── solvers.ts           <-- TypeScript implementations of all 8 numerical methods
│   │   │   ├── matrixUtils.ts       <-- Matrix operations, determinant & condition number
│   │   │   ├── benchmark.ts         <-- Shared 200-run median benchmarking module
│   │   │   ├── sharedFormatters.ts  <-- Standardized number & error formatters (sci-notation)
│   │   │   └── numericalTests.ts    <-- Automated self-testing verification suite
│   │   │
│   │   └── components/
│   │       ├── DashboardSection.tsx    <-- Section 1: SCADA Overview & KPI Cards
│   │       ├── LiveSimSection.tsx      <-- Section 2: Real-Time Dynamic Digital Twin
│   │       ├── NumLabSection.tsx       <-- Section 3: Group A ODE Integration Lab
│   │       ├── PredictionSection.tsx   <-- Section 4: Group B Arrival Horizon Predictor
│   │       ├── DistributionSection.tsx <-- Section 5: Group C Linear 3-Pipe Distribution
│   │       ├── GraphsSection.tsx       <-- Section 6: Multi-Series Convergence & Error Plots
│   │       ├── ComparisonSection.tsx   <-- Section 7: Complete 8-Method Academic Benchmark
│   │       ├── SettingsSection.tsx     <-- Section 8: Presets & Parameter Configurations
│   │       ├── ScadaWaterTank.tsx      <-- Animated SVG water tank with hysteresis markers
│   │       └── LiveClock.tsx           <-- Isolated 1-second telemetry clock
│
└── python_app/                      <-- Python Native Implementation
    ├── app.py                       <-- Flask REST API Server & Route Handlers
    ├── solvers.py                   <-- All 8 Numerical Solvers in Python (NumPy/SciPy)
    ├── test_solvers.py              <-- Regression verification script for all Python solvers
    ├── requirements.txt             <-- Python package dependencies
    ├── run.bat                      <-- Python launcher
    └── static/
        ├── index.html               <-- Native single-page dashboard
        ├── style.css                <-- Standalone CSS tokens matching React design system
        └── app.js                   <-- Frontend controller, Chart.js binder, and Web Audio API
```

---

## 🖥️ Module & Feature Walkthrough (Konta Ki Kaj Kore)

### 1. Dashboard (`DashboardSection.tsx`)
- Provides a bird's-eye view of the entire water tank system.
- Displays 4 live KPI telemetry cards: Current Volume ($L$), Inflow Pump Status (Active/Standby), Net Volumetric Rate ($\frac{dV}{dt}$ in $L/\text{min}$), and Current Solver Mode.
- Shows the central **SCADA Digital Twin** with animated fluid waves and dynamic height.

### 2. Live Simulation (`LiveSimSection.tsx` & `ScadaWaterTank.tsx`)
- High-fidelity visual twin showing inlet pipe, motorized pump impeller, high/low cutoffs, and outlet drain.
- Runs the **Dual-Threshold Hysteresis Logic**:
  - Automatically triggers pump activation below $200\text{ L}$.
  - Automatically cuts pump power at $900\text{ L}$.
- Allows manual overrides and physical parameter testing.

### 3. Numerical Lab (`NumLabSection.tsx`)
- Dedicated to **Group A Initial Value Problem (IVP)** integration.
- Compares **Euler**, **Modified Euler / Heun**, and **RK4** against the high-precision reference curve.
- Allows adjusting step size $h$ ($0.1$ to $5.0\text{ min}$) with instant re-computation.
- Displays Maximum Absolute Error ($L$), RMS Error ($L$), and theoretical stability intervals.

### 4. Level Prediction (`PredictionSection.tsx`)
- Implements **Group B Non-Linear Root-Finding**.
- Predicts the exact minute the tank will reach any volume target (e.g. $500\text{ L}$).
- Human-friendly headline: *"Tank reaches 500 L in about 32 min 12 s"*.
- Side-by-side comparison of **Bisection**, **False Position**, and **Newton-Raphson**.
- Step-by-step iteration table logging intermediate estimates, $g(t_k)$, $g'(t_k)$, and error.

### 5. Water Distribution (`DistributionSection.tsx`)
- Resolves the $3 \times 3$ linear algebraic network for Zone 1 ($q_A$), Zone 2 ($q_B$), and Zone 3 ($q_C$).
- **Elevated Manifold Badge**: Zero-overlap SVG pipe network schematic.
- Dynamic stroke width: pipe line widths expand and contract proportionally to flow rate.
- **Synchronized Row Stepper**: Step through row reductions one by one or click *Autoplay* to watch forward elimination and back-substitution live.
- Verification badge proving Gaussian Elimination and Gauss-Jordan agree within $|x_{GE} - x_{GJ}| < 10^{-12}$.

### 6. Graphs & Analysis (`GraphsSection.tsx`)
- Multi-series trajectory plots with toggleable lines.
- Residual plots showing difference from benchmark solution ($|V - V_{\text{ref}}|$).
- Logarithmic-scale error curves demonstrating asymptotic convergence slopes.

### 7. Method Comparison (`ComparisonSection.tsx`)
- Master evaluation matrix of all **8 Numerical Methods**.
- Grouped neatly under **Group A (ODE)**, **Group B (Roots)**, and **Group C (Linear Systems)**.
- Real execution times measured via in-browser high-resolution timer (`performance.now()`) over 200 repetitions.
- Shows textbook flop counts, function evaluations, and concrete stability bounds.
- **CSV Export**: One-click download of the complete academic comparison table.

### 8. Settings (`SettingsSection.tsx`)
- **Global Single Source of Truth**: Changes made here immediately update all 7 other pages.
- Includes 3 engineering presets:
  1. **Academic Lab Default**: Capacity $1000\text{ L}$, $Q_{\text{in}} = 20\text{ L/min}$, $Q_{\text{out}} = 8\text{ L/min}$, $k = 0.8$.
  2. **Municipal Reservoir**: Scaled up to $50,000\text{ L}$, $Q_{\text{in}} = 500\text{ L/min}$.
  3. **Residential Overhead**: Compact $500\text{ L}$, $Q_{\text{in}} = 15\text{ L/min}$.
- Input validation prevents invalid physical states (e.g., $V_0 > \text{Capacity}$ or $Q_{\text{in}} \le 0$).

---

## 🚀 How to Run (Kivabe Run Kore — Step by Step)

### Option 1: Running the React Application (Recommended UI)

#### Prerequisites:
- **Node.js** (v18.0.0 or later recommended). Download from [nodejs.org](https://nodejs.org/).

#### Method A — One-Click Launcher:
1. Double-click the file:  
   👉 **`run.bat`** (located in the project folder).
2. The script will automatically verify your Node.js environment, check dependencies, launch Vite, and open your default browser at:  
   👉 **`http://localhost:5173`**

#### Method B — Terminal Commands:
Open a terminal (PowerShell or Command Prompt) and run:
```bash
cd "E:\Numerical Project\SMART_WATER_TANK_SIMULATOR\SMART_WATER_TANK_SIMULATOR"
npm install
npm run dev
```

---

### Option 2: Running the Python Flask Application

#### Prerequisites:
- **Python** (v3.10 or later). Pre-installed with `pip`.

#### Method A — One-Click Launcher:
1. Double-click the file:  
   👉 **`run_python.bat`** (located in the project folder).
2. The script will verify Python, auto-install missing packages from `requirements.txt`, launch the Flask backend on port `5000`, and open:  
   👉 **`http://localhost:5000`**

#### Method B — Terminal Commands:
Open a terminal and run:
```bash
cd "E:\Numerical Project\SMART_WATER_TANK_SIMULATOR\python_app"
pip install -r requirements.txt
python app.py
```

To run the automated Python solver verification test suite:
```bash
python test_solvers.py
```

---

## 📊 Performance & Verification Benchmarks

### Production Build Verification
The React production build passed with **0 errors**:
```text
✓ 2095 modules transformed.
dist/index.html                   0.91 kB
dist/assets/index.css            55.55 kB
dist/assets/index.js            855.09 kB
✓ built in 5.64s
```

### Numerical Accuracy & Solver Agreement
- **Linear Solvers Agreement**: $|x_{\text{Gaussian}} - x_{\text{Gauss-Jordan}}| = 0.000\text{ L/min}$ (within machine precision $\approx 10^{-16}$).
- **Root-Finding Agreement**: Bisection, False Position, and Newton-Raphson all converge to the exact same physical arrival time $t^* \approx 32.205\text{ min}$ for $V_{\text{target}} = 500\text{ L}$.
- **ODE Error Hierarchy**: For step size $h = 1.0\text{ min}$:
  - Forward Euler: $\text{Max Error} \approx 1.53\text{ L}$ ($O(h)$)
  - Modified Euler (Heun): $\text{Max Error} \approx 3.20 \times 10^{-2}\text{ L}$ ($O(h^2)$)
  - RK4: $\text{Max Error} \approx 4.81 \times 10^{-5}\text{ L}$ ($O(h^4)$)

---

## 📜 Academic Integrity & License
This project was developed for academic defense and evaluation in the course **CSE-2204 Numerical Methods** at **Bangladesh University of Professionals (BUP)** by **Imtiyaz Ali** and **Md. Udoy Hossain Joy**. 

All rights reserved © 2026.
