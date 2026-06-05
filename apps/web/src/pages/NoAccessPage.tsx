import { StatePanel } from "../components/StatePanel";

export function NoAccessPage() {
  return (
    <StatePanel
      title="No analytics access"
      detail="Your website account resolved successfully, but no analytics dashboard policy is assigned."
      tone="error"
    />
  );
}
