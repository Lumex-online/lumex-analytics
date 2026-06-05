export function StatePanel({
  title,
  detail,
  tone = "neutral"
}: {
  title: string;
  detail: string;
  tone?: "neutral" | "error";
}) {
  return (
    <section className={`state-panel state-panel--${tone}`}>
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}
