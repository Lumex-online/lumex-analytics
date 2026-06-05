import { useQuery } from "@tanstack/react-query";
import type { DashboardKey } from "@lumex/shared-types";
import { apiClient } from "../api/client";
import { FilterSummary } from "../components/FilterSummary";
import { KpiCard } from "../components/KpiCard";
import { PageSection } from "../components/PageSection";
import { StatePanel } from "../components/StatePanel";

export function DashboardPage({
  dashboardKey,
  title,
  description
}: {
  dashboardKey: DashboardKey;
  title: string;
  description: string;
}) {
  const filtersQuery = useQuery({
    queryKey: ["filters", dashboardKey],
    queryFn: () => apiClient.getFilters(dashboardKey)
  });

  const summaryQuery = useQuery({
    queryKey: ["summary", dashboardKey],
    enabled: Boolean(filtersQuery.data),
    queryFn: () =>
      apiClient.getSummary(dashboardKey, {
        dateRange: filtersQuery.data?.defaults.dateRange
      })
  });

  const chartQuery = useQuery({
    queryKey: ["chart", dashboardKey, "primary"],
    enabled: Boolean(filtersQuery.data),
    queryFn: () =>
      apiClient.getChart(dashboardKey, "primary-trend", {
        dateRange: filtersQuery.data?.defaults.dateRange
      })
  });

  if (filtersQuery.isLoading || summaryQuery.isLoading || chartQuery.isLoading) {
    return <StatePanel title={`Loading ${title}`} detail="Preparing scoped dashboard data." />;
  }

  if (filtersQuery.isError || summaryQuery.isError || chartQuery.isError) {
    return <StatePanel title={`Unable to load ${title}`} detail="One or more analytics APIs failed." tone="error" />;
  }

  if (!filtersQuery.data || !summaryQuery.data || !chartQuery.data) {
    return <StatePanel title="No data returned" detail="The analytics backend returned an empty response." tone="error" />;
  }

  return (
    <div className="page">
      <header className="page__hero">
        <div>
          <span className="eyebrow">{dashboardKey}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="hero-scope">
          <span className="pill">
            {summaryQuery.data.appliedScope.limitedByPermissions ? "Scoped View" : "Global View"}
          </span>
          <span className="hero-scope__time">
            Updated {new Date(summaryQuery.data.lastUpdatedAt).toLocaleString()}
          </span>
        </div>
      </header>

      <FilterSummary metadata={filtersQuery.data} />

      <section className="kpi-grid">
        {summaryQuery.data.kpis.map((item) => (
          <KpiCard key={item.key} item={item} />
        ))}
      </section>

      <PageSection
        title="Primary Trend"
        description="This starter scaffold returns server-prepared series so charting can be swapped to ECharts or Nivo without changing API contracts."
      >
        <div className="chart-card">
          <div className="chart-card__legend">
            {chartQuery.data.series.map((series) => (
              <span key={series.name} className="pill">
                {series.name}
              </span>
            ))}
          </div>
          <div className="chart-table">
            <div className="chart-table__head">
              <span>Date</span>
              {chartQuery.data.series.map((series) => (
                <span key={series.name}>{series.name}</span>
              ))}
            </div>
            {chartQuery.data.categories.map((category, index) => (
              <div key={category} className="chart-table__row">
                <span>{category}</span>
                {chartQuery.data.series.map((series) => (
                  <span key={`${category}-${series.name}`}>{series.data[index] ?? 0}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </PageSection>
    </div>
  );
}
