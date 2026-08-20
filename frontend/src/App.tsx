import { AuthStatus } from "./AuthStatus";
import { DecadeBreakdown } from "./DecadeBreakdown";
import { HealthStatus } from "./HealthStatus";
import { TopItems } from "./TopItems";
import { TrackingControl } from "./TrackingControl";
import { TrendChart } from "./TrendChart";

export function App() {
  return (
    <main>
      <h1>Spoticrack</h1>
      <HealthStatus />
      <AuthStatus />
      <TrackingControl />
      <TopItems />
      <DecadeBreakdown />
      <TrendChart />
    </main>
  );
}
