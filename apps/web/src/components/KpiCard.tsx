import type { KpiCard as KpiCardType } from "@lumex/shared-types";

function formatValue(value: number, unit?: KpiCardType["unit"]) {
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(value);
  }

  if (unit === "percent") {
    return `${value.toFixed(2)}%`;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: unit === "weight" ? 2 : 0
  }).format(value);
}

export function KpiCard({ item }: { item: KpiCardType }) {
  return (
    <article className="kpi-card">
      <span className="kpi-card__label">{item.label}</span>
      <strong className="kpi-card__value">{formatValue(item.value, item.unit)}</strong>
      {item.changeLabel ? <span className="kpi-card__subtle">{item.changeLabel}</span> : null}
    </article>
  );
}
