import { AuthStatus } from "./AuthStatus";
import { DecadeBreakdown } from "./DecadeBreakdown";
import { HealthStatus } from "./HealthStatus";
import { TopItems } from "./TopItems";

export function App() {
  return (
    <main>
      <h1>Spoticrack</h1>
      <HealthStatus />
      <AuthStatus />
      <TopItems />
      <DecadeBreakdown />
    </main>
  );
}
