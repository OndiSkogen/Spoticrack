import { AuthStatus } from "./AuthStatus";
import { HealthStatus } from "./HealthStatus";

export function App() {
  return (
    <main>
      <h1>Spoticrack</h1>
      <HealthStatus />
      <AuthStatus />
    </main>
  );
}
