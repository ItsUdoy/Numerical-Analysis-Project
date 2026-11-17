# Smart Water Tank Simulator — Design System & Engineering Reference
Course: **CSE-2204 Numerical Methods**  
Application: **Smart Water Tank Dashboard & SCADA System**

---

## 1. Design Tokens & Theme Architecture

The design system is based on semantic CSS custom properties defined on `:root` and `.dark` in `src/index.css` and mirrored in `src/designTokens.ts`. All elements strictly adhere to **WCAG AA contrast guidelines (min 4.5:1 for normal text, 3:1 for large text and UI components)** in both Dark and Light themes.

### Theme Color Palette

| Token | Dark Mode (`.dark`) | Light Mode (`:root`) | Semantic Role |
| :--- | :--- | :--- | :--- |
| `--bg-base` | `#0B1220` | `#F8FAFC` | Page canvas & background |
| `--bg-surface` | `#111A2E` | `#FFFFFF` | Cards, panels, dropdowns |
| `--bg-elevated` | `#172238` | `#F1F5F9` | Inputs, table headers, hover states |
| `--border` | `rgba(255, 255, 255, 0.08)` | `rgba(0, 0, 0, 0.08)` | Subtle separators & card borders |
| `--border-strong` | `rgba(255, 255, 255, 0.16)` | `rgba(0, 0, 0, 0.16)` | Active borders, input focus outlines |
| `--text-primary` | `#F1F5F9` (AAA 14.8:1) | `#0F172A` (AAA 15.2:1) | Headings, primary metrics, active text |
| `--text-secondary` | `#A9B4C7` (AA 5.2:1) | `#475569` (AA 5.8:1) | Body prose, input labels, axis ticks |
| `--text-muted` | `#7C8AA3` (AA 4.6:1) | `#64748B` (AA 4.6:1) | Tertiary notes, helper text, units |
| `--accent` | `#3B82F6` (Blue 500) | `#2563EB` (Blue 600) | Brand primary, active tabs, buttons |
| `--success` | `#22C55E` (Green 500) | `#16A34A` (Green 600) | Converged states, best accuracy, pass |
| `--warning` | `#F59E0B` (Amber 500) | `#D97706` (Amber 600) | Low water alarm, tolerance reference line |
| `--danger` | `#EF4444` (Red 500) | `#DC2626` (Red 600) | Overflow alarm, reverse flow, errors |

### Spacing & Typography Standards
- **Grid**: 8px baseline spacing grid (`8px`, `16px`, `24px`, `32px`).
- **Typography**: Minimum font size `12px` everywhere in the application.
  - Labels & navigation: `13px` - `14px`.
  - Body text: `13px` - `14px`.
  - Large KPI numbers: `32px` - `36px` (`font-bold font-mono tabular-nums`).
- **Units**: Inside inputs as suffixes or directly beside values. Always `L`, `L/min`, `min`, `ms`, `µs`.

---

## 2. Shared Method Identity & Visual Hierarchy

To ensure instantaneous cognitive recognition across all pages (Numerical Lab, Graphs & Analysis, Method Comparison, SCADA Tank), every numerical method is assigned a **fixed color, line style, and geometric dot marker**:

| Method | Group | Color | Line Style | Marker | Theoretical Rate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Reference Solution** | Exact Benchmark | `#94A3B8` (Slate) | Dashed (`5 5`) | None | Ground Truth (RK4, $h = 0.01\text{ min}$) |
| **Euler Method** | Group A: ODE | `#F59E0B` (Amber) | Solid (`2px`) | Circle `●` | $O(h)$ — 1st Order |
| **Modified Euler (Heun)** | Group A: ODE | `#06B6D4` (Cyan) | Dashed (`5 5`) | Square `■` | $O(h^2)$ — 2nd Order |
| **Runge-Kutta 4th (RK4)** | Group A: ODE | `#10B981` (Emerald) | Solid (`2.5px`) | Diamond `◆` | $O(h^4)$ — 4th Order |
| **Bisection** | Group B: Root | `#F59E0B` (Amber) | Solid (`2px`) | Circle `●` | Linear ($\varepsilon_{k+1} = 0.5\varepsilon_k$) |
| **False Position** | Group B: Root | `#06B6D4` (Cyan) | Dashed (`5 5`) | Square `■` | Linear (can stagnate at one fixed bound) |
| **Newton-Raphson** | Group B: Root | `#10B981` (Emerald) | Solid (`2.5px`) | Diamond `◆` | Quadratic ($\varepsilon_{k+1} \approx C\varepsilon_k^2$) |
| **Gaussian Elimination** | Group C: Linear | `#3B82F6` (Blue) | — | — | $(1/3)n^3 + n^2$ textbook ops |
| **Gauss-Jordan (RREF)** | Group C: Linear | `#10B981` (Emerald) | — | — | $(1/2)n^3 + n^2$ textbook ops |
| **Pipe A (Zone 1)** | Hydraulic Network | `#3B82F6` (Blue) | Fluid dash | Rect | Variable $x$ |
| **Pipe B (Zone 2)** | Hydraulic Network | `#10B981` (Green) | Fluid dash | Rect | Variable $y$ |
| **Pipe C (Zone 3)** | Hydraulic Network | `#F59E0B` (Amber) | Fluid dash | Rect | Variable $z$ |

---

## 3. Chart Design Standards

Every Recharts data visualization in the application adheres to the following unified principles:
1. **Interactive Legend Bar Above the Chart**: Legends are placed top-left above the plot container with `12px` font. Recharts built-in bottom legends are omitted to eliminate any overlap with the x-axis label.
2. **Axis Typography & Clear Units**:
   - X-axis and Y-axis tick labels are formatted with minimum `12px` in `--text-secondary`.
   - Generous bottom margin (`margin={{ bottom: 26, left: 15 }}`) ensures axis labels like `"Time t (min)"` and `"Iteration (k)"` never collide with ticks.
3. **Logarithmic Clamping Floor**: On log-scale error charts, numerical zero errors ($0$ or $< 10^{-14}$) are clamped to a floor of `1e-12` (`Math.max(1e-12, error)`). This ensures Newton-Raphson and RK4 converged points are plotted cleanly with distinct markers without producing `NaN` or `-Infinity`.
4. **Tolerance Reference Line**: A dashed horizontal reference line is plotted at $y = \varepsilon$ labeled `"Tolerance ε = 0.0001"`.
5. **Reduced Motion**: All animations (fluid wave paths, impeller rotation, dash-offset flows) respect `@media (prefers-reduced-motion: reduce)`.

---

## 4. Shared Formatters Module (`src/sharedFormatters.ts`)

- `formatErrorSci(val, isPercentage)`: Always formats numerical errors with 3 significant digits in exponential scientific notation (e.g. `1.76e+0`, `4.61e-3`, `1.94e-7`). Values below $10^{-6}$ are rendered as `< 1.00e-6` rather than misleading `0.0000`.
- `formatVolume(val, 'table' | 'summary')`: 4 decimals for tabular data (`235.1245 L`), 2 decimals for summaries (`235.12 L`).
- `formatFlowRate(val)`: Always `"L/min"`, never `"L/m"`.
- `formatTime(val, includeSecs)`: `"32.20 min (32m 12s)"`.
- `formatExecutionTime(ms)`: Formats in microseconds (`42.5 µs`) when $< 1\text{ ms}$, and milliseconds (`1.240 ms`) otherwise.

---

## 5. Shared Benchmark Module (`src/benchmark.ts`)

Rather than relying on single-pass calls subject to browser timer quantization (Spectre mitigations often clamp `performance.now()` to 0.1ms), `benchmarkFunction` runs **200 repetitions**, takes the true median time, and computes the exact count of function evaluations ($f(t,V)$ calls). All benchmark cards display the label:
> *"Measured in-browser, median of 200 runs"*
