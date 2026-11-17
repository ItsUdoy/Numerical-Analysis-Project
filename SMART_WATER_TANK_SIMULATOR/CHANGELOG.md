# Changelog — Smart Water Tank Dashboard Overhaul
Course: **CSE-2204 Numerical Methods**

---

## Phase 1: Foundation (Shared Architecture)
- **1.1 Design Tokens**: Created comprehensive CSS variable tokens in `src/index.css` and `src/designTokens.ts` for both Dark (`#0B1220`, `#111A2E`, `#172238`) and Light themes (`#F8FAFC`, `#FFFFFF`, `#F1F5F9`). All colors achieve WCAG AA contrast (5.2:1+).
- **1.2 Theme System**: Synchronized theme toggle with `document.documentElement.classList`, persisted user choice in `localStorage.tank_dashboard_theme`, and respected OS `prefers-color-scheme`.
- **1.3 Shared State (`AppContext.tsx`)**: Created unified state store for global simulation parameters, single global step size $h$, shared ODE solvers cache, and sticky save/discard management.
- **1.3b Method Identity**: Standardized colors, line styles, and dot shapes across all methods. Renamed *"Exact Reference (Fine RK4)"* to *"Reference solution (RK4, h = 0.01 min)"* throughout.
- **1.4 Shared Formatters (`sharedFormatters.ts`)**: Implemented `formatErrorSci` (3 sig figs, `< 1.00e-6`), `formatVolume`, `formatFlowRate` (strictly `"L/min"`, eliminated `"L/m"`), and `formatExecutionTime` (microseconds for $< 1\text{ ms}$).
- **1.5 Shared Benchmark Module (`benchmark.ts`)**: Built multi-pass median benchmark (200 repetitions) reporting exact microsecond execution times and function evaluation counts with *"Measured in-browser, median of 200 runs"*.
- **1.6 AppShell (`App.tsx`)**:
  - Replaced unpinned sidebar badge with a pinned flex-column `StatusBox` showing System Status, Volume, and Valve/Pump state.
  - Implemented live 1-second auto-updating clock in the header.
  - Integrated print PDF button with landscape print stylesheet.
- **1.7 Chart Standards**: Positioned legends above plots, formatted axis ticks with min `12px`, clamped log-scale error floors to `1e-12`, and added hover tooltips with crosshairs.

---

## Phase 2: Correctness Fixes
- **2.1 Water Distribution Determinant & Condition Number (`matrixUtils.ts`)**:
  - Fixed determinant bug: Replaced incorrect formula `det(A) = -5` with exact Laplace expansion $\det(A) = 2r + 1 = 7$ for default $r = 3$.
  - Implemented exact 1-norm condition number $\kappa_1(A) = \|A\|_1 \|A^{-1}\|_1 \approx 4.57$ with semantic status badges (Well-Conditioned $\kappa_1 < 10$).
  - Renamed *"Pressure Diff"* to *"Flow Difference (Zone 1 - Zone 2)"*.
  - Added feasibility validation: Inline alert banner when reverse backflow ($q < 0$) is detected, and clamped pipe stroke widths to 2px - 14px range.
- **2.2 False Position Convergence Label**: Changed from misleading *"Superlinear (Secant)"* to mathematically accurate *"Linear (can stagnate: one endpoint stays fixed)"* across all pages.
- **2.3 Dynamic Iteration Counts & Verdicts**: Eliminated hardcoded strings (e.g. `~10 iters` vs `9`); all verdicts are generated from live computed step lengths.
- **2.4 Table Step Matching**: Synchronized table title and row counts directly from global step size $h$ and duration $T$ ($N = T/h + 1$).
- **2.5 Operation Count Convention**: Formatted textbook multiplications/divisions $(1/3)n^3 + n^2$ with total flops $\approx (2/3)n^3$ in explanatory tooltips.
- **2.6 Concrete Stability Boundaries**: Replaced vague text with concrete analytical stability regions: Euler $(-2, 0), h < 2/|\lambda|$; Heun $(-2, 0)$; RK4 $\approx (-2.78, 0)$.
- **2.7 Settings Parameters & Validation**: Added missing outflow rate and Torricelli discharge coefficient $k$ inputs. Added validation rules and inflow warning.
- **2.8 Automated Numerical Test Suite (`numericalTests.ts`)**: Built verification test suite testing linear solver agreement ($|x_{GE} - x_{GJ}| < 10^{-9}$), root-finding convergence, and ODE asymptotic error scaling ($2\times$ for Euler, $4\times$ for Heun, $16\times$ for RK4).

---

## Phase 3: Page-by-Page Redesign

### 3.1 Numerical Lab (`NumLabSection.tsx`)
- Standardized group tabs (Group A, B, C) with focus rings and active indicator.
- Result cards show large tabular volume, order badge with tooltip, scientific error formatting, and real benchmark times.
- Step-by-step table displays sticky header, monospace tabular numbers, and absolute errors for Euler, Heun, and RK4.

### 3.2 Level Prediction (`PredictionSection.tsx`)
- Plain-language headline: *"Tank reaches 500 L in about 32 min 12 s (at 07:55 PM)"* with mm:ss.
- Agreement banner: *"All three methods agree (Δ = 2.4e-5 min)"*.
- Dynamic *"⚡ Fastest"* badge awarded based on actual minimum iterations.
- Dark-theme slider with accent filled track and quick preset buttons (300L, 500L, 700L, 900L).
- Interactive error chart with log/linear scale toggle, dashed tolerance line at $\varepsilon$, and distinct diamond converged markers.
- New collapsible iteration details table with step-by-step residues and CSV export.

### 3.3 Water Distribution (`DistributionSection.tsx`)
- Scaled pipe stroke width proportionally to flow rates (2px - 14px) with animated fluid dash flows.
- Centered manifold schematic and added compact results strip with percentage share bars.
- Replaced nested scrolling lists with a unified synchronized stepper (Prev, Next, Autoplay, progress bar).
- Augmented matrix displays proper bracket notation, vertical separator bar before $b$, and pivot highlights.
- Comparison card proving Gaussian Elimination and Gauss-Jordan agree to machine precision ($|x_{GE} - x_{GJ}| < 10^{-9}$).

### 3.4 Graphs & Analysis (`GraphsSection.tsx`)
- Resolved trajectory overlap with "Zoom to end region (last 8m)" and a linked "Difference from reference (L)" sub-chart.
- Replaced cramped top-right text with 3 formatted stat chips.
- Convergence tab plots log-log error vs step size with validated slopes ($p \approx 1, 2, 4$).
- Sawtooth hysteresis tab displays 180-min cycle with shaded ON/OFF thresholds.
- Added key insights row with 4 computed analytical cards.

### 3.5 Method Comparison (`ComparisonSection.tsx`)
- Grouped rows under 3 clear section headers with colored indicators.
- Split mixed metric column into dedicated primary metrics: Max Absolute Error (L), Iterations to Tolerance, and Residual $\|Ax - b\|$.
- Added "Accuracy vs Cost" scatter plot and bar charts.
- Included "Which method should I use?" decision guide.
- Added "Verify Numerics" modal dialog to execute live automated test suite.

### 3.6 Settings (`SettingsSection.tsx`)
- Live persistence to `localStorage` with sticky save/discard action bar when unsaved changes exist.
- Form validation with inline error messages for capacities, thresholds, and flow rates.
- Presets styled as radio-cards (Lab Default Academic, Municipal Reservoir, Residential Overhead) with quick value chips and Undo support.
- Interactive dual-handle hysteresis visualizer showing pump ON/OFF triggers and initial volume marker.
- Factory reset danger button with confirmation modal; JSON import and export with schema validation.

---

## Phase 4: Quality & Verification
- **Contrast Audit**: Verified WCAG AA contrast (5.2:1+) across all components in both dark and light modes.
- **Accessibility**: Keyboard navigation enabled for all tabs, sliders, and buttons with visible focus rings.
- **Responsive Design**: Verified layout across desktop (1440px), tablet (768px-1024px icon rail), and mobile (390px drawer).
- **Test Suite Pass**: All numerical verification tests verified passing cleanly.
