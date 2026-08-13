#!/usr/bin/env python3
"""
generate_figures.py — builds the matplotlib data figures used by Article 2
(reliability engineering). Run standalone or imported by generate_articles.py
(which calls main() before compiling the LaTeX, so figures are always fresh).

Palette: validated categorical slots from the project's dataviz reference
palette (references/palette.md), checked with scripts/validate_palette.js
before use here — 5-slot adjacent-pair set passes CVD/normal-vision floors;
the contrast WARN it carries is resolved by direct value labels on every
mark (the "relief rule"), applied throughout below.
"""

from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("pdf")
import matplotlib.pyplot as plt  # noqa: E402

FIG_DIR = Path(__file__).parent / "figures"

# Validated categorical palette (light surface), fixed slot order — see
# references/palette.md. Slot 1 blue is also used alone as the sequential
# hue for single-series plots (soil calibration curve).
BLUE = "#2a78d6"
GREEN = "#008300"
MAGENTA = "#e87ba4"
YELLOW = "#eda100"
AQUA = "#1baf7a"
RED = "#e34948"
INK = "#0b0b0b"
MUTED = "#52514e"
GRID = "#d8d7d0"
SURFACE = "#fcfcfb"

CATEGORICAL_5 = [BLUE, GREEN, MAGENTA, YELLOW, AQUA]


def _base_style():
    plt.rcParams.update(
        {
            "font.family": "serif",
            "font.serif": ["Times New Roman", "Times", "DejaVu Serif"],
            "font.size": 11,
            "axes.edgecolor": MUTED,
            "axes.labelcolor": INK,
            "text.color": INK,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "axes.linewidth": 0.8,
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
        }
    )


def _clean_axes(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(MUTED)
    ax.spines["bottom"].set_color(MUTED)
    ax.tick_params(length=3)


# ─────────────────────────────────────────────────────────────────────────────
# Figure 1 — defect taxonomy (bar chart, matches Table 2)
# ─────────────────────────────────────────────────────────────────────────────

def fig_defect_taxonomy():
    labels = ["A\nUnbounded\nblocking", "B\nSensor fault\nmasking",
              "C\nUnbounded\nallocation", "D\nBoot-time\nraces", "Other"]
    counts = [4, 5, 2, 3, 2]

    _base_style()
    fig, ax = plt.subplots(figsize=(5.4, 3.3), dpi=200)
    x = np.arange(len(labels))
    bars = ax.bar(x, counts, width=0.6, color=CATEGORICAL_5,
                   edgecolor=SURFACE, linewidth=2, zorder=3)

    for rect, c in zip(bars, counts):
        ax.annotate(str(c), (rect.get_x() + rect.get_width() / 2, rect.get_height()),
                    xytext=(0, 4), textcoords="offset points",
                    ha="center", va="bottom", fontsize=10.5, color=INK)

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=8.8, color=MUTED)
    ax.set_ylabel("Defects found")
    ax.set_ylim(0, 6)
    ax.set_yticks(range(0, 7))
    ax.yaxis.grid(True, color=GRID, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    _clean_axes(ax)
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)

    fig.tight_layout()
    FIG_DIR.mkdir(exist_ok=True)
    fig.savefig(FIG_DIR / "defect_taxonomy.pdf")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────────
# Figure 2 — soil-moisture calibration curve + fault margins (Eq. 1-2)
# ─────────────────────────────────────────────────────────────────────────────

def fig_soil_calibration():
    r_dry, r_wet = 3300, 1400
    span = r_dry - r_wet
    margin = max(0.10 * abs(span), 60)

    r = np.linspace(700, 4000, 600)
    p_hat = (r_dry - r) / (r_dry - r_wet) * 100.0
    p = np.clip(p_hat, 0, 100)

    lo, hi = min(r_dry, r_wet) - margin, max(r_dry, r_wet) + margin

    _base_style()
    fig, ax = plt.subplots(figsize=(5.6, 3.4), dpi=200)

    # Fault zones (Eq. 2) — shaded, print-safe neutral tone (not a
    # categorical hue: this is a status/validity region, not a data series).
    ax.axvspan(700, lo, color=RED, alpha=0.10, zorder=1)
    ax.axvspan(hi, 4000, color=RED, alpha=0.10, zorder=1)
    ax.axvline(lo, color=RED, linewidth=1, linestyle=(0, (3, 2)), zorder=2)
    ax.axvline(hi, color=RED, linewidth=1, linestyle=(0, (3, 2)), zorder=2)

    ax.plot(r, p, color=BLUE, linewidth=2.2, zorder=4, label=r"$p(r)$ — Eq. (1)")

    ax.axvline(r_wet, color=MUTED, linewidth=0.8, linestyle=":", zorder=2)
    ax.axvline(r_dry, color=MUTED, linewidth=0.8, linestyle=":", zorder=2)
    ax.annotate(r"$r_{\mathrm{wet}}$", (r_wet, 108), ha="center", fontsize=9, color=MUTED)
    ax.annotate(r"$r_{\mathrm{dry}}$", (r_dry, 108), ha="center", fontsize=9, color=MUTED)

    ax.annotate("fault zone\n(rail-pinned)", (820, 40), fontsize=8.3, color=RED, ha="left")
    ax.annotate("fault zone\n(rail-pinned)", (3880, 40), fontsize=8.3, color=RED, ha="right")

    ax.set_xlabel(r"raw ADC reading $r$")
    ax.set_ylabel(r"reported moisture $p$ (%)")
    ax.set_xlim(700, 4000)
    ax.set_ylim(-8, 118)
    ax.yaxis.grid(True, color=GRID, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    _clean_axes(ax)

    fig.tight_layout()
    FIG_DIR.mkdir(exist_ok=True)
    fig.savefig(FIG_DIR / "soil_calibration.pdf")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────────
# Figure 3 — bounded-oversampling worst-case latency, before vs. after (Eq. 6-7)
# ─────────────────────────────────────────────────────────────────────────────

def fig_oversample_latency():
    labels = ["Fixed count\n($k=16$)", "Budgeted early-exit\n($k_{\\min}=8,\\, B=150$ms)"]
    values = [800, 400]
    colors = [RED, GREEN]

    _base_style()
    fig, ax = plt.subplots(figsize=(4.6, 3.2), dpi=200)
    y = np.arange(len(labels))
    bars = ax.barh(y, values, height=0.5, color=colors, edgecolor=SURFACE,
                    linewidth=2, zorder=3)

    for rect, v in zip(bars, values):
        ax.annotate(f"{v} ms", (rect.get_width(), rect.get_y() + rect.get_height() / 2),
                    xytext=(6, 0), textcoords="offset points",
                    ha="left", va="center", fontsize=10.5, color=INK)

    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=9.5)
    ax.set_xlabel(r"worst-case $T_{\mathrm{read}}^{\max}$ per channel (ms)")
    ax.set_xlim(0, 950)
    ax.xaxis.grid(True, color=GRID, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    _clean_axes(ax)
    ax.spines["bottom"].set_visible(False)
    ax.tick_params(axis="x", length=0)
    ax.invert_yaxis()

    fig.tight_layout()
    FIG_DIR.mkdir(exist_ok=True)
    fig.savefig(FIG_DIR / "oversample_latency.pdf")
    plt.close(fig)


# ─────────────────────────────────────────────────────────────────────────────
# Figure 4 — CI compile-verification matrix coverage over the audit (Article 3)
# ─────────────────────────────────────────────────────────────────────────────

def fig_ci_matrix_growth():
    labels = ["Initial CI\nmatrix", "+ field-deployed\ndiagnostic modes", "Full compile-\nverification gate"]
    values = [8, 10, 15]

    _base_style()
    fig, ax = plt.subplots(figsize=(5.0, 3.1), dpi=200)
    x = np.arange(len(labels))
    bars = ax.bar(x, values, width=0.55, color=[BLUE, YELLOW, GREEN],
                   edgecolor=SURFACE, linewidth=2, zorder=3)

    for rect, v in zip(bars, values):
        ax.annotate(str(v), (rect.get_x() + rect.get_width() / 2, rect.get_height()),
                    xytext=(0, 4), textcoords="offset points",
                    ha="center", va="bottom", fontsize=11, color=INK)

    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=9)
    ax.set_ylabel("Build configurations verified")
    ax.set_ylim(0, 17)
    ax.yaxis.grid(True, color=GRID, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    _clean_axes(ax)
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)

    fig.tight_layout()
    FIG_DIR.mkdir(exist_ok=True)
    fig.savefig(FIG_DIR / "ci_matrix_growth.pdf")
    plt.close(fig)


def main():
    plt.rcParams["text.usetex"] = False  # mathtext only — no system LaTeX dependency here
    fig_defect_taxonomy()
    fig_soil_calibration()
    fig_oversample_latency()
    fig_ci_matrix_growth()
    print(f"[ok] figures written to {FIG_DIR}")


if __name__ == "__main__":
    main()
