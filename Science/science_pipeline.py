from Science.comparison.site_comparison import (
    analyse_site,
    compare_sites
)


def run_site_analysis(
    site,
    start_time,
    end_time,
    step_minutes=15,
    thresholds=None
):
    """
    Main entry point for analysing one lunar site.

    SPICE kernels must already be loaded.
    """

    return analyse_site(
        site=site,
        start_time=start_time,
        end_time=end_time,
        step_minutes=step_minutes,
        thresholds=thresholds
    )


def run_site_comparison(
    sites,
    start_time,
    end_time,
    step_minutes=15,
    thresholds=None
):
    """
    Main entry point for comparing multiple lunar sites.

    SPICE kernels must already be loaded.
    """

    return compare_sites(
        sites=sites,
        start_time=start_time,
        end_time=end_time,
        step_minutes=step_minutes
    )