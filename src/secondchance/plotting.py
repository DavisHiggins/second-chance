"""Shared matplotlib styling, so every figure in the paper looks like the same paper.

The palette is the validated categorical set from the project's visual system:
eight hues in a fixed order that clears colour vision deficiency separation
checks on adjacent pairs. Two rules follow from how it was validated and are
worth stating because breaking them quietly is easy:

  * Hues are assigned in slot order and never cycled. A ninth series does not get
    a generated colour, it gets folded into "other" or split into small multiples.
  * For any figure where every pair of series can appear side by side (scatter,
    small multiples), only the first three slots are safe. Past three, facet.

Everything else here is about making the figures readable at the size they will
actually be printed, which for a two column paper is about three and a quarter
inches wide.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt

# --- the validated categorical palette, light surface -------------------------
SERIES = [
    "#2a78d6",  # 1 blue
    "#eb6834",  # 2 orange
    # Darkened from the palette's #1baf7a, which measures 2.74:1 against this
    # surface and misses the 3:1 WCAG floor for a graphical object. A six percent
    # darkening clears it at 3.10:1 without moving the hue, and
    # tests/test_plotting.py asserts the floor for every colour in this list.
    "#19a473",  # 3 aqua
    "#eda100",  # 4 yellow
    "#e87ba4",  # 5 magenta
    "#008300",  # 6 green
    "#4a3aa7",  # 7 violet
    "#e34948",  # 8 red
]
# Safe subset when every pair may be adjacent on screen, and, separately, the
# only slots this project draws from.
#
# The reason for the second constraint. The palette above is validated for mutual
# distinguishability, including under the common colour vision deficiencies. It is
# not validated for contrast against a light page: measured against this surface,
# the yellow at slot 4 is 2.11:1 and the magenta at slot 5 is 2.62:1, both below
# the 3:1 WCAG floor for a graphical object such as a line or a bar. Those two
# slots are perfectly readable on a dark surface and are wrong here.
#
# Rather than darken them, which would pull them toward their neighbours and break
# the separation they were chosen for, the paper's figures never use more than
# three series at once and take them from this list. Where a chart genuinely needs
# more categories it becomes a small-multiple or a directly labelled bar chart,
# which is a better chart anyway. tests/test_plotting.py asserts the floor for
# every colour here.
SERIES_SAFE = SERIES[:3]

# Retained under its original name for anything that imports it.
SERIES_ALL_PAIRS = SERIES_SAFE

# Single hue ramp for ordered magnitude. Steps 250 through 700 stay above the
# 2:1 contrast floor on the light surface, so an ordinal ramp starts at 250.
SEQUENTIAL = [
    "#86b6ef",  # 250
    "#6da7ec",  # 300
    "#5598e7",  # 350
    "#3987e5",  # 400
    "#2a78d6",  # 450
    "#256abf",  # 500
    "#1c5cab",  # 550
    "#184f95",  # 600
    "#104281",  # 650
    "#0d366b",  # 700
]

STATUS = {
    "good": "#0ca30c",
    "warning": "#fab219",
    "serious": "#ec835a",
    "critical": "#d03b3b",
}

SURFACE = "#fcfcfb"
INK_PRIMARY = "#0b0b0b"
INK_SECONDARY = "#52514e"
INK_MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"

# Two column paper. A single column figure is 3.25 inches wide; a full width one
# is 6.9. Anything wider gets scaled down by the typesetter and the labels stop
# being legible.
WIDTH_SINGLE = 3.35
WIDTH_DOUBLE = 6.9


def apply_style() -> None:
    """Set the rcParams every figure in this project shares."""
    mpl.rcParams.update(
        {
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
            "savefig.bbox": "tight",
            "savefig.dpi": 300,
            "font.family": "sans-serif",
            "font.sans-serif": ["DejaVu Sans", "Helvetica", "Arial"],
            "font.size": 8,
            "axes.titlesize": 9,
            "axes.titleweight": "semibold",
            "axes.titlepad": 8,
            "axes.labelsize": 8,
            "axes.labelcolor": INK_SECONDARY,
            "axes.edgecolor": AXIS,
            "axes.linewidth": 0.8,
            "axes.grid": True,
            "axes.axisbelow": True,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "grid.color": GRID,
            "grid.linewidth": 0.6,
            "grid.alpha": 1.0,
            "xtick.color": INK_MUTED,
            "ytick.color": INK_MUTED,
            "xtick.labelsize": 7.5,
            "ytick.labelsize": 7.5,
            "xtick.major.size": 3,
            "ytick.major.size": 3,
            "xtick.major.width": 0.8,
            "ytick.major.width": 0.8,
            "legend.frameon": False,
            "legend.fontsize": 7.5,
            "legend.handlelength": 1.6,
            "legend.handletextpad": 0.5,
            "legend.columnspacing": 1.2,
            "lines.linewidth": 2.0,
            "lines.markersize": 4.5,
            "lines.solid_capstyle": "round",
            "text.color": INK_PRIMARY,
            "figure.constrained_layout.use": False,
        }
    )


def heading(ax, title: str, subtitle: str | None = None, title_size: float = 8.8) -> None:
    """Draw a left-aligned title with an optional subtitle above the axes.

    Both are drawn with ax.text rather than ax.set_title. Matplotlib puts
    set_title at a fixed offset that does not know a subtitle exists, so the two
    collide the moment the subtitle is more than a few words. Placing both by hand
    at explicit axes-fraction heights is the only way to guarantee they never
    overlap regardless of figure size.
    """
    subtitle_lines = 0
    if subtitle:
        subtitle_lines = subtitle.count("\n") + 1
        ax.text(
            0.0, 1.012, subtitle, transform=ax.transAxes,
            fontsize=7.0, color=INK_SECONDARY, va="bottom", ha="left", linespacing=1.35,
        )
    title_y = 1.012 + 0.052 * max(subtitle_lines, 0) + (0.016 if subtitle else 0.012)
    ax.text(
        0.0, title_y, title, transform=ax.transAxes,
        fontsize=title_size, weight="semibold", color=INK_PRIMARY, va="bottom", ha="left",
    )


def finish(ax, title: str | None = None, subtitle: str | None = None,
           xlabel: str | None = None, ylabel: str | None = None,
           legend: bool = False, legend_loc: str = "best", legend_ncol: int = 1,
           title_size: float = 8.8) -> None:
    """Apply the recurring axis furniture in one call."""
    if title:
        heading(ax, title, subtitle, title_size)
    elif subtitle:
        heading(ax, "", subtitle, title_size)
    if xlabel:
        ax.set_xlabel(xlabel)
    if ylabel:
        ax.set_ylabel(ylabel)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.grid(axis="x", visible=False)
    if legend:
        ax.legend(loc=legend_loc, ncol=legend_ncol)


def save(fig, path: str | Path, also_pdf: bool = True) -> None:
    """Write a PNG for the slides and a PDF for the paper."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path.with_suffix(".png"), dpi=300, bbox_inches="tight")
    if also_pdf:
        fig.savefig(path.with_suffix(".pdf"), bbox_inches="tight")
    plt.close(fig)


def annotate_value(ax, x, y, text: str, dx: float = 0, dy: float = 6, color: str | None = None) -> None:
    """Direct label a single point. Text stays in ink, never in the series colour."""
    ax.annotate(
        text,
        xy=(x, y),
        xytext=(dx, dy),
        textcoords="offset points",
        fontsize=7,
        color=color or INK_SECONDARY,
        ha="center",
    )
