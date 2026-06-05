import type { PropsWithChildren } from "react";

export function PageSection({
  title,
  description,
  children
}: PropsWithChildren<{ title: string; description?: string }>) {
  return (
    <section className="page-section">
      <div className="page-section__header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
