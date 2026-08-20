import { AuthStatus } from "./AuthStatus";
import { DecadeBreakdown } from "./DecadeBreakdown";
import { HealthStatus } from "./HealthStatus";
import { InviteManager } from "./InviteManager";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { TopItems } from "./TopItems";
import { TrackingControl } from "./TrackingControl";
import { TrendChart } from "./TrendChart";

function BrandMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="10" width="3" height="6" fill="var(--accent)" />
      <rect x="7" y="6" width="3" height="14" fill="var(--accent)" />
      <rect x="12" y="2" width="3" height="20" fill="var(--accent-2)" />
      <rect x="17" y="8" width="3" height="10" fill="var(--accent)" />
    </svg>
  );
}

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <BrandMark />
          <h1 className="app-header__title">Spoticrack</h1>
        </div>
        <div className="app-header__meta">
          <AuthStatus />
        </div>
      </header>
      <ThemeSwitcher />
      <HealthStatus />
      <InviteManager />
      <TrackingControl />
      <TopItems />
      <DecadeBreakdown />
      <TrendChart />
    </div>
  );
}
