import { Outlet } from "react-router-dom";
import { EmbedBridge } from "../components/EmbedBridge";

export function EmbeddedAnalyticsLayout() {
  return (
    <div className="embed-shell">
      <EmbedBridge />
      <main className="embed-shell__content">
        <Outlet />
      </main>
    </div>
  );
}
