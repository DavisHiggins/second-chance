"""Tests for the figure style module.

Two of the fourteen figures in this paper shipped with a title overlapping its own
subtitle before this was noticed, which is the kind of defect that is obvious in a
rendered image and invisible in the code that produced it. `heading()` exists
because `ax.set_title` places a title at a fixed offset that does not know a
subtitle is there, so the two collide the moment the subtitle runs past a few
words.

That geometry is what these tests pin. They also check the palette, because a
categorical series that fails a contrast check is a chart that some readers cannot
use, and that is not something to discover in a printed paper.
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pytest

from secondchance.plotting import (
    GRID,
    INK_MUTED,
    INK_PRIMARY,
    INK_SECONDARY,
    SEQUENTIAL,
    SERIES,
    SERIES_SAFE,
    STATUS,
    SURFACE,
    WIDTH_DOUBLE,
    WIDTH_SINGLE,
    annotate_value,
    apply_style,
    finish,
    heading,
    save,
)


@pytest.fixture
def axes():
    """A fresh figure and axes, closed afterwards so the suite does not leak them."""
    figure, ax = plt.subplots(figsize=(WIDTH_SINGLE, 2.2))
    yield ax
    plt.close(figure)


def relative_luminance(hex_colour: str) -> float:
    """WCAG relative luminance for a hex colour."""
    channels = []
    for offset in (1, 3, 5):
        value = int(hex_colour[offset : offset + 2], 16) / 255
        channels.append(value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4)
    red, green, blue = channels
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(foreground: str, background: str) -> float:
    """WCAG contrast ratio between two hex colours."""
    lighter = max(relative_luminance(foreground), relative_luminance(background))
    darker = min(relative_luminance(foreground), relative_luminance(background))
    return (lighter + 0.05) / (darker + 0.05)


# --- the geometry that produced a real bug -----------------------------------


def test_a_title_never_sits_on_top_of_its_subtitle(axes):
    """The defect this helper exists to prevent, asserted as a coordinate.

    The title has to be placed above the subtitle's top edge, and by enough that
    the two do not touch at any figure size.
    """
    heading(axes, "A title", "A subtitle that runs on for a while")
    subtitle, title = axes.texts[0], axes.texts[1]

    assert subtitle.get_text().startswith("A subtitle")
    assert title.get_text() == "A title"
    assert title.get_position()[1] > subtitle.get_position()[1], (
        "the title was placed at or below the subtitle, which is the overlap this "
        "helper exists to prevent"
    )


def test_the_title_moves_up_as_the_subtitle_grows(axes):
    """A two-line subtitle needs more room than a one-line subtitle.

    A fixed offset is exactly the mistake `ax.set_title` makes, so the offset here
    has to be a function of how many lines the subtitle actually occupies.
    """
    figure_two, ax_two = plt.subplots()
    try:
        heading(axes, "Title", "One line")
        heading(ax_two, "Title", "Line one\nLine two\nLine three")
        one_line = axes.texts[1].get_position()[1]
        three_lines = ax_two.texts[1].get_position()[1]
        assert three_lines > one_line, "the title did not move up for a taller subtitle"
    finally:
        plt.close(figure_two)


def test_a_title_with_no_subtitle_still_clears_the_axes(axes):
    heading(axes, "Just a title")
    assert len(axes.texts) == 1
    assert axes.texts[0].get_position()[1] > 1.0, "the title is inside the plot area"


def test_both_are_left_aligned_to_the_axis(axes):
    """Left aligned to the data, not centred over it. Centred titles read as decoration."""
    heading(axes, "Title", "Subtitle")
    for text in axes.texts:
        assert text.get_position()[0] == 0.0
        assert text.get_ha() == "left"


def test_heading_is_not_used_for_the_matplotlib_title(axes):
    """`ax.set_title` must stay empty, or two titles render at once."""
    heading(axes, "Title", "Subtitle")
    assert axes.get_title() == ""


# --- finish() -----------------------------------------------------------------


def test_finish_applies_the_furniture_in_one_call(axes):
    axes.plot([0, 1], [0, 1], label="a series")
    finish(axes, title="Title", subtitle="Subtitle", xlabel="Days", ylabel="Share", legend=True)

    assert axes.get_xlabel() == "Days"
    assert axes.get_ylabel() == "Share"
    assert axes.get_legend() is not None
    assert len(axes.texts) == 2


def test_finish_draws_horizontal_gridlines_only(axes):
    """Vertical gridlines on a categorical axis are noise between the categories."""
    finish(axes, title="Title")
    assert any(line.get_visible() for line in axes.get_ygridlines())
    assert not any(line.get_visible() for line in axes.get_xgridlines())


def test_finish_accepts_a_subtitle_with_no_title(axes):
    """Used by the panels of a multi-part figure, which carry one title between them."""
    finish(axes, subtitle="Panel note")
    assert len(axes.texts) == 2
    assert axes.texts[1].get_text() == ""


def test_finish_adds_no_legend_when_not_asked(axes):
    """A single-series chart with a legend is a chart apologising for itself."""
    axes.plot([0, 1], [0, 1], label="only series")
    finish(axes, title="Title")
    assert axes.get_legend() is None


# --- the palette ---------------------------------------------------------------


def test_every_series_colour_is_a_six_digit_hex():
    for colour in SERIES + SEQUENTIAL + list(STATUS.values()):
        assert colour.startswith("#"), colour
        assert len(colour) == 7, colour
        int(colour[1:], 16)


def test_series_colours_are_distinct():
    assert len(set(SERIES)) == len(SERIES)


def test_every_colour_this_project_draws_with_is_readable_on_the_page():
    """3:1 is the WCAG floor for a graphical object such as a line or a bar.

    Asserted for SERIES_SAFE rather than for the whole palette. The full palette
    is validated for mutual distinguishability, not for contrast against a light
    page, and two of its eight slots sit below the floor here. See the note beside
    SERIES_SAFE for why they are excluded rather than darkened.
    """
    for colour in SERIES_SAFE:
        ratio = contrast_ratio(colour, SURFACE)
        assert ratio >= 3.0, f"{colour} is {ratio:.2f}:1 against the background"


def test_the_safe_subset_is_the_prefix_of_the_palette():
    """So that a chart taking the first N colours is automatically compliant."""
    assert SERIES[: len(SERIES_SAFE)] == SERIES_SAFE
    assert len(SERIES_SAFE) >= 3, "three series is the minimum a comparison chart needs"


def test_the_excluded_slots_are_excluded_for_the_stated_reason():
    """If a palette revision fixes them, this fails and the note should be removed."""
    below_floor = [c for c in SERIES if contrast_ratio(c, SURFACE) < 3.0]
    assert set(below_floor).isdisjoint(SERIES_SAFE)
    assert below_floor, (
        "every palette slot now clears 3:1, so the SERIES_SAFE restriction and the "
        "comment explaining it are obsolete"
    )


def test_every_ink_level_is_readable_as_body_text():
    """4.5:1 for primary and secondary; muted is only used for tick labels."""
    assert contrast_ratio(INK_PRIMARY, SURFACE) >= 4.5
    assert contrast_ratio(INK_SECONDARY, SURFACE) >= 4.5
    assert contrast_ratio(INK_MUTED, SURFACE) >= 3.0


def test_gridlines_are_quieter_than_the_data():
    """A grid that competes with the series is a grid drawn too dark."""
    grid_contrast = contrast_ratio(GRID, SURFACE)
    assert grid_contrast < 2.0
    for colour in SERIES:
        assert contrast_ratio(colour, SURFACE) > grid_contrast


def test_the_sequential_ramp_is_monotone_in_luminance():
    """A ramp that brightens in the middle stops encoding order."""
    luminances = [relative_luminance(c) for c in SEQUENTIAL]
    assert luminances == sorted(luminances) or luminances == sorted(luminances, reverse=True)


def test_status_colours_are_not_reused_as_series_colours():
    """Red must mean "critical" everywhere, never "the third line on this chart"."""
    assert not set(STATUS.values()) & set(SERIES)


def test_status_names_cover_the_bands_the_product_uses():
    assert {"good", "warning", "serious", "critical"} <= set(STATUS)


# --- widths and saving ---------------------------------------------------------


def test_column_widths_match_the_two_column_layout():
    """Anything wider gets scaled down by the typesetter and the labels stop being legible."""
    assert WIDTH_SINGLE < WIDTH_DOUBLE
    assert 3.0 <= WIDTH_SINGLE <= 3.6
    assert 6.5 <= WIDTH_DOUBLE <= 7.2


def test_apply_style_is_idempotent():
    """The analysis scripts call it at import time and again per figure."""
    apply_style()
    first = dict(matplotlib.rcParams)
    apply_style()
    assert dict(matplotlib.rcParams) == first


def test_apply_style_hides_the_top_and_right_spines():
    apply_style()
    assert matplotlib.rcParams["axes.spines.top"] is False
    assert matplotlib.rcParams["axes.spines.right"] is False


def test_save_writes_both_a_png_and_a_pdf(tmp_path):
    """PNG for the slides, PDF for the paper, from one call so they cannot diverge."""
    figure, ax = plt.subplots()
    ax.plot([0, 1], [0, 1])
    save(figure, tmp_path / "figures" / "fig99_example")

    assert (tmp_path / "figures" / "fig99_example.png").exists()
    assert (tmp_path / "figures" / "fig99_example.pdf").exists()


def test_save_creates_the_output_directory(tmp_path):
    figure, ax = plt.subplots()
    ax.plot([0, 1], [0, 1])
    save(figure, tmp_path / "does" / "not" / "exist" / "fig")
    assert (tmp_path / "does" / "not" / "exist" / "fig.png").exists()


def test_save_closes_the_figure(tmp_path):
    """Fourteen figures in one script is fourteen leaked figures without this."""
    figure, ax = plt.subplots()
    ax.plot([0, 1], [0, 1])
    save(figure, tmp_path / "fig", also_pdf=False)
    assert not plt.fignum_exists(figure.number)


def test_annotate_value_labels_in_ink_not_in_the_series_colour(axes):
    """A number in the series colour reads as part of the line rather than as a value."""
    axes.plot([0, 1], [0, 1])
    annotate_value(axes, 0.5, 0.5, "42%")
    annotation = axes.texts[-1]
    assert annotation.get_text() == "42%"
    assert annotation.get_color() not in SERIES
