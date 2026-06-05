import type { DashboardFiltersMetadata } from "@lumex/shared-types";

export function FilterSummary({ metadata }: { metadata: DashboardFiltersMetadata }) {
  const warehouses = metadata.warehouses ?? [];
  const buyers = metadata.buyers ?? [];
  const productTypes = metadata.productTypes ?? [];
  const subAdmins = metadata.subAdmins ?? [];
  const skus = metadata.skus ?? [];
  const shapes = metadata.shapes ?? [];

  return (
    <div className="filter-summary">
      <div>
        <span className="filter-summary__label">Warehouses</span>
        <strong>{warehouses.length}</strong>
      </div>
      <div>
        <span className="filter-summary__label">Buyers</span>
        <strong>{buyers.length}</strong>
      </div>
      <div>
        <span className="filter-summary__label">Product Types</span>
        <strong>{productTypes.length}</strong>
      </div>
      <div>
        <span className="filter-summary__label">Sub Admins</span>
        <strong>{subAdmins.length}</strong>
      </div>
      <div>
        <span className="filter-summary__label">SKU</span>
        <strong>{skus.length}</strong>
      </div>
      <div>
        <span className="filter-summary__label">Shapes</span>
        <strong>{shapes.length}</strong>
      </div>
    </div>
  );
}
