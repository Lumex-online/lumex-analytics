import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  BreakdownItem,
  ChartSeries,
  DashboardFiltersInput,
  ExecutiveAlert,
  ExecutiveKpi,
  HeatmapMatrix,
  RateBreakdownItem
} from "@lumex/shared-types";
import { apiClient } from "../api/client";
import { PageSection } from "../components/PageSection";
import { StatePanel } from "../components/StatePanel";

function formatCompactNumber(
  value: number,
  mode: "currency" | "count" | "percent" | "weight" = "count"
) {
  if (mode === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
      notation: Math.abs(value) >= 1000 ? "compact" : "standard"
    }).format(value);
  }

  if (mode === "percent") {
    return `${value.toFixed(1)}%`;
  }

  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: mode === "weight" ? 2 : 1
  }).format(value);
}

function formatDelta(value: number | null) {
  if (value === null) {
    return "n/a";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatTargetProgress(value: number) {
  if (value >= 1000) {
    return `${(value / 100).toFixed(0)}x target`;
  }

  if (value >= 200) {
    return `${(value / 100).toFixed(1)}x target`;
  }

  if (value >= 10) {
    return `${value.toFixed(0)}%`;
  }

  if (value >= 1) {
    return `${value.toFixed(1)}%`;
  }

  if (value > 0) {
    return `${value.toFixed(2)}%`;
  }

  return "0%";
}

function formatTargetStatus(value: number) {
  if (value >= 200) {
    return "Well above target";
  }

  if (value >= 100) {
    return "Target exceeded";
  }

  if (value >= 70) {
    return "Tracking to target";
  }

  return "Below target pace";
}

function normalizeDateOnly(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    return "";
  }

  const trimmed = value.trim();
  const parsed = new Date(trimmed);

  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed.slice(0, 10);
}

function parseSafeDate(value: string | undefined) {
  const normalized = normalizeDateOnly(value);

  if (normalized.length === 0) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatTargetDateRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const parsedFrom = parseSafeDate(from);
  const parsedTo = parseSafeDate(to);

  if (!parsedFrom || !parsedTo) {
    return `${from || "Unknown"} to ${to || "Unknown"}`;
  }

  return `${formatter.format(parsedFrom)} to ${formatter.format(parsedTo)}`;
}

function chartColor(index: number) {
  return ["#2a6aa3", "#4f8fca", "#173f67", "#79b8ea", "#5a7ea6", "#8cb2d7"][index] ?? "#2a6aa3";
}

function toPercentWidth(value: number) {
  return `${Math.max(0, Math.min(value, 100))}%`;
}

function getTargetGauge(item: ExecutiveKpi) {
  if (typeof item.targetValue !== "number" || item.targetValue <= 0) {
    return null;
  }

  const achievedRatio = item.value / item.targetValue;
  const achievedPercent = achievedRatio * 100;
  const meterPercent = Math.min(Math.max(achievedPercent, 0), 120);
  let tone = "off-track";

  if (achievedPercent >= 100) {
    tone = "met";
  } else if (achievedPercent >= 70) {
    tone = "close";
  }

  return {
    achievedPercent,
    meterPercent,
    visualPercent: achievedPercent > 0 ? Math.max(meterPercent, 4) : 0,
    tone
  } as const;
}

function buildFilters(input: {
  from: string;
  to: string;
  warehouseKey: string;
  buyerKey: string;
  subAdminKey: string;
  vendorKey: string;
  viewMode: "scoped" | "global_totals";
}): DashboardFiltersInput {
  return {
    dateRange: { from: input.from, to: input.to },
    warehouseKeys: input.warehouseKey ? [Number(input.warehouseKey)] : undefined,
    buyerKeys: input.buyerKey ? [Number(input.buyerKey)] : undefined,
    subAdminKeys: input.subAdminKey ? [Number(input.subAdminKey)] : undefined,
    vendorKeys: input.vendorKey ? [Number(input.vendorKey)] : undefined,
    viewMode: input.viewMode
  };
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExecutiveKpiCard({ item }: { item: ExecutiveKpi }) {
  const targetGauge = getTargetGauge(item);

  return (
    <article className={`executive-kpi ${item.isPending ? "executive-kpi--pending" : ""}`}>
      <div className="executive-kpi__topline">
        <span className="executive-kpi__label">{item.label}</span>
      </div>
      <strong className="executive-kpi__value">
        {item.isPending ? "Pending" : formatCompactNumber(item.value, item.unit ?? "count")}
      </strong>
      {typeof item.targetValue === "number" ? (
        <div className="executive-kpi__target">
          <div className="executive-kpi__target-copy">
            <span className="executive-kpi__target-label">Target</span>
            <span className="executive-kpi__target-range">
              {item.targetDateRange
                ? formatTargetDateRange(item.targetDateRange.from, item.targetDateRange.to)
                : "Saved range"}
            </span>
          </div>
          <div className="executive-kpi__target-metrics">
            <strong className="executive-kpi__target-value">
              {formatCompactNumber(item.targetValue, item.unit ?? "count")}
            </strong>
            {typeof item.targetVariance === "number" ? (
              <strong className={item.targetVariance >= 0 ? "is-positive" : "is-negative"}>
                {item.targetVariance >= 0 ? "+" : ""}
                {formatCompactNumber(item.targetVariance, item.unit ?? "count")}
              </strong>
            ) : null}
          </div>
        </div>
      ) : null}
      {targetGauge ? (
        <div className="executive-kpi__meter-block">
          <div
            className={`executive-kpi__meter executive-kpi__meter--${targetGauge.tone}`}
            role="progressbar"
            aria-label={`${item.label} target progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.max(0, Math.min(targetGauge.achievedPercent, 100))}
          >
            <span
              className="executive-kpi__meter-fill"
              style={{
                width: toPercentWidth(targetGauge.visualPercent),
                minWidth: targetGauge.achievedPercent > 0 ? "8px" : "0"
              }}
            />
          </div>
          <div className="executive-kpi__meter-meta">
            <span>{formatTargetProgress(targetGauge.achievedPercent)} achieved</span>
            <span>{formatTargetStatus(targetGauge.achievedPercent)}</span>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function AlertStrip({ alerts }: { alerts: ExecutiveAlert[] }) {
  return (
    <section className="alert-strip">
      {alerts.map((alert) => (
        <article key={alert.id} className={`alert-pill alert-pill--${alert.tone}`}>
          <strong>{alert.title}</strong>
          <span>{alert.detail}</span>
        </article>
      ))}
    </section>
  );
}

function TrendChart({
  title,
  categories,
  series,
  valueMode
}: {
  title: string;
  categories: string[];
  series: ChartSeries[];
  valueMode: "currency" | "count";
}) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string;
    seriesName: string;
    value: number;
    x: number;
    y: number;
  } | null>(null);
  const width = 720;
  const height = 260;
  const paddingX = 32;
  const paddingTop = 20;
  const paddingBottom = 34;
  const chartHeight = height - paddingTop - paddingBottom;
  const chartWidth = width - paddingX * 2;
  const allValues = series.flatMap((entry) => entry.data);
  const safeMax = Math.max(...allValues, 1);
  const xStep = categories.length <= 1 ? 0 : chartWidth / (categories.length - 1);

  return (
    <div className="chart-card chart-card--elevated chart-card--compact">
      <div className="chart-card__legend">
        <strong>{title}</strong>
        <div className="chart-card__legend-pills">
          {series.map((entry, index) => (
            <span key={entry.name} className="chart-key">
              <span className="chart-key__swatch" style={{ backgroundColor: chartColor(index) }} />
              {entry.name}
            </span>
          ))}
        </div>
      </div>
      <div className="trend-chart">
        <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart__svg" role="img" aria-label={title}>
          {Array.from({ length: 4 }).map((_, tickIndex) => {
            const y = paddingTop + (chartHeight / 3) * tickIndex;
            const tickValue = safeMax - (safeMax / 3) * tickIndex;
            return (
              <g key={tickIndex}>
                <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="trend-chart__grid" />
                <text x={paddingX - 8} y={y + 4} className="trend-chart__tick" textAnchor="end">
                  {formatCompactNumber(tickValue, valueMode)}
                </text>
              </g>
            );
          })}
          {series.map((entry, seriesIndex) => {
            const points = entry.data.map((value, index) => {
              const x = paddingX + xStep * index;
              const y = paddingTop + chartHeight - (value / safeMax) * chartHeight;
              return `${x},${y}`;
            });
            return (
              <polyline
                key={entry.name}
                className="trend-chart__line"
                fill="none"
                stroke={chartColor(seriesIndex)}
                strokeWidth="3"
                points={points.join(" ")}
              />
            );
          })}
          {series.map((entry, seriesIndex) =>
            entry.data.map((value, index) => {
              const x = paddingX + xStep * index;
              const y = paddingTop + chartHeight - (value / safeMax) * chartHeight;

              return (
                <circle
                  key={`${entry.name}-${categories[index] ?? index}`}
                  cx={x}
                  cy={y}
                  r="4"
                  fill={chartColor(seriesIndex)}
                  className="trend-chart__dot"
                  onMouseEnter={() =>
                    setHoveredPoint({
                      label: categories[index] ?? "",
                      seriesName: entry.name,
                      value,
                      x,
                      y
                    })
                  }
                  onMouseLeave={() => setHoveredPoint((current) => (current?.x === x && current?.y === y ? null : current))}
                />
              );
            })
          )}
          {categories.map((category, index) => (
            <text
              key={category}
              x={paddingX + xStep * index}
              y={height - 10}
              className="trend-chart__label"
              textAnchor="middle"
            >
              {categories.length > 8 && index % Math.ceil(categories.length / 6) !== 0 ? "" : category.slice(5)}
            </text>
          ))}
        </svg>
        {hoveredPoint ? (
          <div
            className="chart-tooltip"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
              transform: "translate(-50%, calc(-100% - 8px))"
            }}
          >
            <strong>{hoveredPoint.seriesName}</strong>
            <span>{hoveredPoint.label}</span>
            <em>{formatCompactNumber(hoveredPoint.value, valueMode)}</em>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RankedBars({
  title,
  rows,
  valueMode = "currency"
}: {
  title: string;
  rows: BreakdownItem[];
  valueMode?: "currency" | "count" | "percent";
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="chart-card chart-card--elevated chart-card--compact">
      <div className="chart-card__legend">
        <strong>{title}</strong>
      </div>
      {rows.length === 0 ? (
        <div className="chart-card__empty">No data available for the current filters.</div>
      ) : (
        <div className="ranked-bars">
          {rows.map((row) => (
            <div key={row.key} className="ranked-bars__item">
              <div className="ranked-bars__labels">
              <span>{row.label}</span>
              <strong>{formatCompactNumber(row.value, valueMode)}</strong>
            </div>
            <div className="ranked-bars__track">
              <div
                className="ranked-bars__fill"
                style={{
                  width: valueMode === "percent"
                    ? toPercentWidth(row.value)
                    : `${maxValue === 0 ? 0 : (row.value / maxValue) * 100}%`
                }}
              />
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function RateBars({ title, rows }: { title: string; rows: RateBreakdownItem[] }) {
  const noteLabel = title.toLowerCase().includes("fulfilled") ? "fulfilled" : "converted";

  return (
    <div className="chart-card chart-card--elevated chart-card--compact">
      <div className="chart-card__legend">
        <strong>{title}</strong>
      </div>
      <div className="ranked-bars">
        {rows.map((row) => (
          <div key={row.key} className="ranked-bars__item">
            <div className="ranked-bars__labels">
              <span>{row.label}</span>
              <strong>{formatCompactNumber(row.rate, "percent")}</strong>
            </div>
            <div className="ranked-bars__track">
              <div
                className="ranked-bars__fill ranked-bars__fill--cool"
                style={{ width: toPercentWidth(row.rate) }}
              />
            </div>
            <span className="rate-bar__note">
              {formatCompactNumber(row.numeratorValue)} / {formatCompactNumber(row.denominatorValue)} {noteLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DualBars({
  title,
  rows,
  primaryLabel,
  secondaryLabel
}: {
  title: string;
  rows: Array<{
    key: string;
    label: string;
    primaryValue: number;
    secondaryValue: number;
    fulfilmentRatio?: number;
  }>;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const maxValue = Math.max(...rows.flatMap((row) => [row.primaryValue, row.secondaryValue]), 1);

  return (
    <div className="chart-card chart-card--elevated chart-card--compact">
      <div className="chart-card__legend">
        <strong>{title}</strong>
        <div className="chart-card__legend-pills">
          <span className="chart-key">
            <span className="chart-key__swatch" style={{ backgroundColor: chartColor(0) }} />
            {primaryLabel}
          </span>
          <span className="chart-key">
            <span className="chart-key__swatch" style={{ backgroundColor: chartColor(1) }} />
            {secondaryLabel}
          </span>
        </div>
      </div>
      <div className="dual-bars">
        {rows.map((row) => (
          <div key={row.key} className="dual-bars__item">
            <div className="dual-bars__header">
              <strong>{row.label}</strong>
            </div>
            <div className="dual-bars__metric">
              <span>{primaryLabel}</span>
              <div className="dual-bars__track">
                <div
                  className="dual-bars__fill"
                  style={{ width: `${(row.primaryValue / maxValue) * 100}%`, backgroundColor: chartColor(0) }}
                />
              </div>
              <em>{formatCompactNumber(row.primaryValue, "currency")}</em>
            </div>
            <div className="dual-bars__metric">
              <span>{secondaryLabel}</span>
              <div className="dual-bars__track">
                <div
                  className="dual-bars__fill"
                  style={{ width: `${(row.secondaryValue / maxValue) * 100}%`, backgroundColor: chartColor(1) }}
                />
              </div>
              <em>{formatCompactNumber(row.secondaryValue, "currency")}</em>
            </div>
            <div className="dual-bars__metric">
              <span>Fulfilment</span>
              <div className="dual-bars__track">
                <div
                  className="dual-bars__fill dual-bars__fill--cool"
                  style={{ width: toPercentWidth(row.fulfilmentRatio ?? 0) }}
                />
              </div>
              <em>{formatCompactNumber(row.fulfilmentRatio ?? 0, "percent")}</em>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutBreakdown({ title, rows }: { title: string; rows: BreakdownItem[] }) {
  const [hoveredItem, setHoveredItem] = useState<BreakdownItem | null>(null);
  const items = rows.slice(0, 5);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const size = 170;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = items.map((item, index) => {
    const length = total === 0 ? 0 : (item.value / total) * circumference;
    const segment = {
      item,
      color: chartColor(index),
      length,
      offset
    };

    offset += length;
    return segment;
  });

  return (
    <div className="chart-card chart-card--elevated chart-card--compact">
      <div className="chart-card__legend">
        <strong>{title}</strong>
      </div>
      <div className="donut-breakdown">
        <div className="donut-breakdown__chart" onMouseLeave={() => setHoveredItem(null)}>
          <svg
            className="donut-breakdown__svg"
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={title}
          >
            <circle
              className="donut-breakdown__track"
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#d9dfde"
              strokeWidth={strokeWidth}
            />
            {segments.map((segment) => (
              <circle
                key={segment.item.key}
                className="donut-breakdown__segment"
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                strokeDashoffset={-segment.offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseEnter={() => setHoveredItem(segment.item)}
              />
            ))}
          </svg>
          <div className="donut-breakdown__hole">
            <button
              type="button"
              className="donut-breakdown__total"
              onMouseEnter={() => setHoveredItem({ key: "total", label: "Total", value: total })}
              onMouseLeave={() => setHoveredItem((currentItem) => (currentItem?.key === "total" ? null : currentItem))}
            >
              <strong>{formatCompactNumber(total)}</strong>
              <span>Total</span>
            </button>
          </div>
        </div>
        <div className="donut-breakdown__legend">
          {items.map((item, index) => (
            <div
              key={item.key}
              className="donut-breakdown__legend-item"
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem((currentItem) => (currentItem?.key === item.key ? null : currentItem))}
            >
              <span className="chart-key__swatch" style={{ backgroundColor: chartColor(index) }} />
              <span>{item.label}</span>
              <strong>{formatCompactNumber(item.value)}</strong>
            </div>
          ))}
        </div>
        {hoveredItem ? (
          <div className="chart-tooltip donut-breakdown__tooltip">
            <strong>{hoveredItem.label}</strong>
            <span>{formatCompactNumber(hoveredItem.value)}</span>
            <em>
              {total === 0 ? "0.0%" : formatCompactNumber((hoveredItem.value / total) * 100, "percent")} share
            </em>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FunnelChart({ title, rows }: { title: string; rows: BreakdownItem[] }) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="chart-card chart-card--elevated chart-card--compact">
      <div className="chart-card__legend">
        <strong>{title}</strong>
      </div>
      <div className="funnel-chart">
        {rows.map((row, index) => (
          <div key={row.key} className="funnel-chart__step">
            <div
              className="funnel-chart__bar"
              style={{ width: `${(row.value / maxValue) * 100}%`, backgroundColor: chartColor(index) }}
            >
              <span>{row.label}</span>
              <strong>{formatCompactNumber(row.value)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatmapCard({ title, matrix }: { title: string; matrix: HeatmapMatrix }) {
  const maxValue = Math.max(...matrix.values.flat(), 1);
  const isEmpty = matrix.rowLabels.length === 0 || matrix.columnLabels.length === 0;

  return (
    <div className="chart-card chart-card--elevated chart-card--compact">
      <div className="chart-card__legend">
        <strong>{title}</strong>
        <div className="chart-card__legend-pills">
          <span className="chart-key">Measure: Stone Count</span>
          <span className="chart-key">Scope: Top 10 combinations</span>
        </div>
      </div>
      <div className="heatmap-card">
        {isEmpty ? (
          <div className="heatmap-card__empty">No combinations available for the current filters.</div>
        ) : (
          <div
            className="heatmap-card__grid"
            style={{ gridTemplateColumns: `minmax(150px, 1.8fr) repeat(${matrix.columnLabels.length}, minmax(0, 1fr))` }}
          >
            <div className="heatmap-card__corner">Shape / Size</div>
            {matrix.columnLabels.map((label) => (
              <div key={label} className="heatmap-card__column">
                {label}
              </div>
            ))}
            {matrix.rowLabels.map((rowLabel, rowIndex) => (
              <div key={rowLabel} className="heatmap-card__row-group">
                <div className="heatmap-card__row">{rowLabel}</div>
                {(matrix.values[rowIndex] ?? []).map((value, columnIndex) => (
                  <div
                    key={`${rowLabel}-${matrix.columnLabels[columnIndex]}`}
                    className="heatmap-card__cell"
                    style={{
                      backgroundColor: `rgba(22, 91, 86, ${0.12 + (value / maxValue) * 0.78})`
                    }}
                  >
                    {value}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="pending-panel">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

export function OperationalDashboardPage({ embedded = false }: { embedded?: boolean }) {
  const permissionsQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => apiClient.getMyPermissions()
  });
  const filtersQuery = useQuery({
    queryKey: ["filters", "overview"],
    queryFn: () => apiClient.getFilters("overview")
  });

  const [filterState, setFilterState] = useState({
    from: "",
    to: "",
    warehouseKey: "",
    buyerKey: "",
    subAdminKey: "",
    vendorKey: ""
  });
  const [trendMetric, setTrendMetric] = useState<"sales" | "purchase" | "orders" | "buyers">("sales");
  const [returnTrendRange, setReturnTrendRange] = useState({ from: "", to: "" });
  const [viewMode, setViewMode] = useState<"scoped" | "global_totals">("scoped");

  const isSubAdmin = permissionsQuery.data?.user.analyticsRole === "sub_admin";
  const buyerLensDisabled = isSubAdmin && viewMode === "global_totals";

  useEffect(() => {
    if (!buyerLensDisabled) {
      return;
    }

    setFilterState((current) => ({
      ...current,
      buyerKey: ""
    }));
  }, [buyerLensDisabled]);

  useEffect(() => {
    const defaults = filtersQuery.data?.defaults.dateRange;

    if (!defaults) {
      return;
    }

    setFilterState((current) => ({
      ...current,
      from: current.from || normalizeDateOnly(defaults.from),
      to: current.to || normalizeDateOnly(defaults.to)
    }));
  }, [filtersQuery.data?.defaults.dateRange]);

  const effectiveFilters = useMemo(() => {
    const defaults = filtersQuery.data?.defaults.dateRange;

    return buildFilters({
      ...filterState,
      buyerKey: buyerLensDisabled ? "" : filterState.buyerKey,
      from: filterState.from || normalizeDateOnly(defaults?.from) || "",
      to: filterState.to || normalizeDateOnly(defaults?.to) || "",
      viewMode: buyerLensDisabled ? "global_totals" : "scoped"
    });
  }, [buyerLensDisabled, filterState, filtersQuery.data?.defaults.dateRange]);

  const executiveQuery = useQuery({
    queryKey: ["executive-dashboard", effectiveFilters],
    enabled: Boolean(filtersQuery.data),
    queryFn: () => apiClient.getExecutiveDashboard(effectiveFilters)
  });

  if (permissionsQuery.isLoading || filtersQuery.isLoading || executiveQuery.isLoading) {
    return (
      <StatePanel
        title="Loading Executive Dashboard"
        detail="Preparing executive sales, inventory, memo, buyer, and vendor analytics."
      />
    );
  }

  if (permissionsQuery.isError || filtersQuery.isError || executiveQuery.isError) {
    return (
      <StatePanel
        title="Executive dashboard unavailable"
        detail="One or more analytics services failed while preparing the executive view."
        tone="error"
      />
    );
  }

  if (!permissionsQuery.data || !filtersQuery.data || !executiveQuery.data) {
    return (
      <StatePanel
        title="No executive data"
        detail="The analytics backend returned an incomplete executive dashboard payload."
        tone="error"
      />
    );
  }

  const trendData = {
    categories: executiveQuery.data.salesTrend.categories ?? [],
    series: {
      sales: [{ name: "Sales", data: executiveQuery.data.salesTrend.sales ?? [] }],
      purchase: [{ name: "Purchase", data: executiveQuery.data.salesTrend.purchase ?? [] }],
      orders: [{ name: "Order Count", data: executiveQuery.data.salesTrend.orders ?? [] }],
      buyers: [{ name: "Verified Buyers", data: executiveQuery.data.salesTrend.buyers ?? [] }]
    }
  };
  const trendLabelByMetric = {
    sales: "Sales",
    purchase: "Purchase",
    orders: "Order Count",
    buyers: "Verified Buyers"
  } as const;
  const trendTitleByMetric = {
    sales: "Sales Over Time",
    purchase: "Purchase Over Time",
    orders: "Order Count Over Time",
    buyers: "Verified Buyers in Scope"
  } as const;
  const trendModeByMetric = {
    sales: "currency",
    purchase: "currency",
    orders: "count",
    buyers: "count"
  } as const;
  const returnTrendCategories = executiveQuery.data.returns.trend.categories ?? [];
  const returnTrendValues = executiveQuery.data.returns.trend.values ?? [];
  const visibleReturnTrend = returnTrendCategories.reduce(
    (accumulator, category, index) => {
      if (returnTrendRange.from && category < returnTrendRange.from) {
        return accumulator;
      }

      if (returnTrendRange.to && category > returnTrendRange.to) {
        return accumulator;
      }

      accumulator.categories.push(category);
      accumulator.values.push(returnTrendValues[index] ?? 0);
      return accumulator;
    },
    { categories: [] as string[], values: [] as number[] }
  );
  return (
    <div className={`page page--rich executive-page${embedded ? " executive-page--embedded" : ""}`}>
        <header className="page__hero page__hero--spotlight executive-hero">
          <div className="page__hero-copy">
            <h1>Lumex.Online Analytics</h1>
          </div>
        </header>

      <section className="filter-bar filter-bar--rich executive-filter-bar">
        <label className="filter-control">
          <span>Date From</span>
          <input
            type="date"
            value={filterState.from}
            onChange={(event) => setFilterState((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label className="filter-control">
          <span>Date To</span>
          <input
            type="date"
            value={filterState.to}
            onChange={(event) => setFilterState((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
        {filtersQuery.data.filterVisibility.warehouses ? (
          <FilterSelect
            label="Warehouse"
            value={filterState.warehouseKey}
            options={filtersQuery.data.warehouses.map((warehouse) => ({
              value: String(warehouse.key),
              label: warehouse.name
            }))}
            onChange={(warehouseKey) => setFilterState((current) => ({ ...current, warehouseKey }))}
          />
        ) : null}
        {filtersQuery.data.filterVisibility.buyers ? (
          <FilterSelect
            label="Buyer"
            value={buyerLensDisabled ? "" : filterState.buyerKey}
            options={filtersQuery.data.buyers.map((buyer) => ({
              value: String(buyer.key),
              label: buyer.name
            }))}
            onChange={(buyerKey) => setFilterState((current) => ({ ...current, buyerKey }))}
            disabled={buyerLensDisabled}
          />
        ) : null}
        {filtersQuery.data.filterVisibility.subAdmins ? (
          <FilterSelect
            label="Sub-admin"
            value={filterState.subAdminKey}
            options={filtersQuery.data.subAdmins.map((subAdmin) => ({
              value: String(subAdmin.key),
              label: subAdmin.name
            }))}
            onChange={(subAdminKey) => setFilterState((current) => ({ ...current, subAdminKey }))}
          />
        ) : null}
        {filtersQuery.data.filterVisibility.vendors ? (
          <FilterSelect
            label="Vendor"
            value={filterState.vendorKey}
            options={filtersQuery.data.vendors.map((vendor) => ({
              value: String(vendor.key),
              label: vendor.name
            }))}
            onChange={(vendorKey) => setFilterState((current) => ({ ...current, vendorKey }))}
          />
        ) : null}
        {isSubAdmin ? (
          <label className="filter-control filter-control--toggle">
            <span>View Mode</span>
            <button
              type="button"
              className={`view-toggle ${buyerLensDisabled ? "view-toggle--active" : ""}`}
              onClick={() => setViewMode((current) => (current === "scoped" ? "global_totals" : "scoped"))}
            >
              {buyerLensDisabled ? "Global Values" : "Buyer Scoped"}
            </button>
          </label>
        ) : null}
      </section>

      {buyerLensDisabled ? (
        <div className="view-mode-note">
          Global values mode is on. Buyer filters and buyer-specific charts are hidden for this sub-admin view.
        </div>
      ) : null}

      <AlertStrip alerts={executiveQuery.data.alerts} />

      <section className="executive-kpi-grid">
        {executiveQuery.data.kpis.map((item) => (
          <ExecutiveKpiCard key={item.key} item={item} />
        ))}
      </section>

      <PageSection title="Business Trend">
        <div className="section-toolbar trend-slicer-bar">
          <label className="filter-control filter-control--compact">
            <span>Date From</span>
            <input
              type="date"
              value={filterState.from}
              onChange={(event) => setFilterState((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label className="filter-control filter-control--compact">
            <span>Date To</span>
            <input
              type="date"
              value={filterState.to}
              onChange={(event) => setFilterState((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
        </div>
        <div className="section-toolbar">
          {(["sales", "purchase", "orders", "buyers"] as const).map((metric) => (
            <button
              key={metric}
              type="button"
              className={`toolbar-chip ${trendMetric === metric ? "toolbar-chip--active" : ""}`}
              onClick={() => setTrendMetric(metric)}
            >
              {trendLabelByMetric[metric]}
            </button>
          ))}
        </div>
        <TrendChart
          title={trendTitleByMetric[trendMetric]}
          categories={trendData.categories}
          series={trendData.series[trendMetric]}
          valueMode={trendModeByMetric[trendMetric]}
        />
      </PageSection>

      <PageSection title="Revenue Distribution">
        <div className="stack-grid">
          <RankedBars title="Sales by Warehouse" rows={executiveQuery.data.revenueDistribution.byWarehouse} />
          <RankedBars title="Sales by Vendor" rows={executiveQuery.data.revenueDistribution.byVendor} />
          {!buyerLensDisabled ? (
            <RankedBars title="Sales by Buyer" rows={executiveQuery.data.revenueDistribution.byBuyer} />
          ) : null}
        </div>
      </PageSection>

      <PageSection title="Geographic Distribution">
        <div className={buyerLensDisabled ? "two-column-grid" : "three-column-grid three-column-grid--equal"}>
          <DonutBreakdown title="Orders by Country" rows={executiveQuery.data.revenueDistribution.ordersByCountry} />
          {!buyerLensDisabled ? (
            <DonutBreakdown title="Buyers by Country" rows={executiveQuery.data.revenueDistribution.buyersByCountry} />
          ) : null}
          <DonutBreakdown title="Vendors by Country" rows={executiveQuery.data.revenueDistribution.vendorsByCountry} />
        </div>
      </PageSection>

      <section className="two-column-grid">
        <PageSection
          title="Inventory and Stock Movement"
        >
          <div className="mini-kpi-grid">
            <article className="mini-kpi">
              <span>In Stock Stones</span>
              <strong>{formatCompactNumber(executiveQuery.data.inventory.inStockStones)}</strong>
            </article>
            <article className="mini-kpi">
              <span>Verified Stones</span>
              <strong>{formatCompactNumber(executiveQuery.data.inventory.verifiedStones)}</strong>
            </article>
            <article className="mini-kpi">
              <span>Not Verified Stones</span>
              <strong>{formatCompactNumber(executiveQuery.data.inventory.notVerifiedStones)}</strong>
            </article>
          </div>
          <div className="stack-grid">
            <RankedBars title="Inventory by Warehouse" rows={executiveQuery.data.inventory.byWarehouse} valueMode="count" />
            <RankedBars title="Inventory Aging" rows={executiveQuery.data.inventory.aging} valueMode="count" />
          </div>
        </PageSection>
        <PageSection
          title="Memo and Conversion Analysis"
        >
          <div className="stack-grid">
            <FunnelChart title="Memo to Order Conversion" rows={executiveQuery.data.memoConversion.funnel} />
            {!buyerLensDisabled ? (
              <RateBars title="Conversion % by Buyer" rows={executiveQuery.data.memoConversion.byBuyer} />
            ) : null}
            <RateBars title="Conversion % by Warehouse" rows={executiveQuery.data.memoConversion.byWarehouse} />
          </div>
        </PageSection>
      </section>

      {!buyerLensDisabled ? (
        <section>
          <PageSection
            title="Buyer and Sub-admin Performance"
          >
            <div className="buyer-performance-layout">
              <div className="buyer-performance-layout__charts">
                <RankedBars title="Sales by Buyer" rows={executiveQuery.data.buyerPerformance.byBuyer} />
                <RankedBars title="Sales by Sub-admin" rows={executiveQuery.data.buyerPerformance.bySubAdmin} />
              </div>
              <DonutBreakdown
                title="Buyer Contribution %"
                rows={executiveQuery.data.buyerPerformance.byBuyer}
              />
            </div>
          </PageSection>
        </section>
      ) : null}

      <section>
        <PageSection
          title="SKU / Stone Performance"
        >
          <div className="sku-performance-stack">
            <div className="sku-performance-row">
              <HeatmapCard title="Heat Map of Cert (Order) + Memo" matrix={executiveQuery.data.skuPerformance.certifiedMemoMatrix} />
              <RankedBars title="Sales by SKU" rows={executiveQuery.data.skuPerformance.certifiedMemoSalesBySku} />
            </div>
            <div className="sku-performance-row">
              <HeatmapCard title="Heat Map of Loose Lots" matrix={executiveQuery.data.skuPerformance.looseLotsMatrix} />
              <RankedBars title="Sales by SKU" rows={executiveQuery.data.skuPerformance.looseLotsSalesBySku} />
            </div>
            <div className="sku-performance-row">
              <HeatmapCard title="Heat Map of Own Shape" matrix={executiveQuery.data.skuPerformance.ownShapeMatrix} />
              <RankedBars title="Sales by SKU" rows={executiveQuery.data.skuPerformance.ownShapeSalesBySku} />
            </div>
          </div>
        </PageSection>
      </section>

      <section>
        <PageSection
          title="Purchase and Vendor Analysis"
        >
          <div className="stack-grid">
            <DualBars
              title="Purchase vs Sales by Vendor"
              rows={executiveQuery.data.purchaseVendor.purchaseVsSalesByVendor}
              primaryLabel="Sales"
              secondaryLabel="Purchase"
            />
            <RateBars title="Fulfilled % by Product Type" rows={executiveQuery.data.purchaseVendor.fulfilmentByType} />
          </div>
        </PageSection>
      </section>

      <section>
        <PageSection
          title="Return and Risk Analysis"
        >
          {executiveQuery.data.returns.available ? (
            executiveQuery.data.returns.summary.orderCount === 0 ? (
              <PendingPanel
                title="No returns for current filters"
                detail="Return analytics are connected, but the selected filters did not produce any return records."
              />
            ) : (
              <div className="return-analysis-layout">
                <div className="mini-kpi-grid">
                  <article className="mini-kpi">
                    <span>Total Return Value</span>
                    <strong>{formatCompactNumber(executiveQuery.data.returns.summary.totalValue, "currency")}</strong>
                  </article>
                  <article className="mini-kpi">
                    <span>Returned Orders</span>
                    <strong>{formatCompactNumber(executiveQuery.data.returns.summary.orderCount)}</strong>
                  </article>
                  <article className="mini-kpi">
                    <span>Returned Stones</span>
                    <strong>{formatCompactNumber(executiveQuery.data.returns.summary.quantity)}</strong>
                  </article>
                  <article className="mini-kpi">
                    <span>Net Sales After Returns</span>
                    <strong>{formatCompactNumber(executiveQuery.data.returns.summary.netSalesAfterReturns, "currency")}</strong>
                  </article>
                </div>
                {buyerLensDisabled ? (
                  <div className="stack-grid">
                    <div className="trend-slicer-bar">
                      <label className="filter-control filter-control--compact">
                        <span>From</span>
                        <input
                          type="date"
                          value={returnTrendRange.from}
                          min={returnTrendCategories[0] ?? undefined}
                          max={returnTrendRange.to || returnTrendCategories[returnTrendCategories.length - 1] || undefined}
                          onChange={(event) =>
                            setReturnTrendRange((current) => ({ ...current, from: event.target.value }))
                          }
                        />
                      </label>
                      <label className="filter-control filter-control--compact">
                        <span>To</span>
                        <input
                          type="date"
                          value={returnTrendRange.to}
                          min={returnTrendRange.from || returnTrendCategories[0] || undefined}
                          max={returnTrendCategories[returnTrendCategories.length - 1] ?? undefined}
                          onChange={(event) =>
                            setReturnTrendRange((current) => ({ ...current, to: event.target.value }))
                          }
                        />
                      </label>
                    </div>
                    <TrendChart
                      title="Return Value Trend"
                      categories={visibleReturnTrend.categories}
                      series={[{ name: "Returns", data: visibleReturnTrend.values }]}
                      valueMode="currency"
                    />
                  </div>
                ) : (
                  <div className="return-analysis-layout__top">
                    <div className="stack-grid">
                      <div className="trend-slicer-bar">
                        <label className="filter-control filter-control--compact">
                          <span>From</span>
                          <input
                            type="date"
                            value={returnTrendRange.from}
                            min={returnTrendCategories[0] ?? undefined}
                            max={returnTrendRange.to || returnTrendCategories[returnTrendCategories.length - 1] || undefined}
                            onChange={(event) =>
                              setReturnTrendRange((current) => ({ ...current, from: event.target.value }))
                            }
                          />
                        </label>
                        <label className="filter-control filter-control--compact">
                          <span>To</span>
                          <input
                            type="date"
                            value={returnTrendRange.to}
                            min={returnTrendRange.from || returnTrendCategories[0] || undefined}
                            max={returnTrendCategories[returnTrendCategories.length - 1] ?? undefined}
                            onChange={(event) =>
                              setReturnTrendRange((current) => ({ ...current, to: event.target.value }))
                            }
                          />
                        </label>
                      </div>
                      <TrendChart
                        title="Return Value Trend"
                        categories={visibleReturnTrend.categories}
                        series={[{ name: "Returns", data: visibleReturnTrend.values }]}
                        valueMode="currency"
                      />
                    </div>
                    <RankedBars title="Return % by Buyer" rows={executiveQuery.data.returns.byBuyer} valueMode="percent" />
                  </div>
                )}
                <div className="return-analysis-layout__grid">
                  <RankedBars title="Return % by Vendor" rows={executiveQuery.data.returns.byVendor} valueMode="percent" />
                  <RankedBars title="Return % by Warehouse" rows={executiveQuery.data.returns.byWarehouse} valueMode="percent" />
                  <RankedBars title="Top Return Reasons" rows={executiveQuery.data.returns.byReason} valueMode="count" />
                  <RankedBars title="Refund Method Distribution" rows={executiveQuery.data.returns.byRefundMethod} valueMode="count" />
                  <RankedBars title="Return Type Distribution" rows={executiveQuery.data.returns.byReturnType} valueMode="count" />
                  <RankedBars title="Returned QC Status" rows={executiveQuery.data.returns.qcStatus} valueMode="count" />
                </div>
              </div>
            )
          ) : (
            <PendingPanel
              title="Return section pending"
              detail={executiveQuery.data.returns.note ?? "Return metrics will appear here once the return source is approved and connected."}
            />
          )}
        </PageSection>
      </section>
    </div>
  );
}
