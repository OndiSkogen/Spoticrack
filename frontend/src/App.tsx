import { AuthStatus } from "./AuthStatus";
import { HealthStatus } from "./HealthStatus";
import { TopItems } from "./TopItems";

export function App() {
  return (
    <main>
      <h1>Spoticrack</h1>
      <HealthStatus />
      <AuthStatus />
      <TopItems />
    </main>
  );
}
