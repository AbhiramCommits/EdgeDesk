import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { RoleBadge } from "./ui/EntityBadges";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleLogout = async (): Promise<void> => {
    await logout();
    toast.push("Signed out", "info");
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand" aria-label="EdgeDesk home">
            <span className="brand__mark" aria-hidden="true">
              ED
            </span>
            <span className="brand__text">
              EdgeDesk
              <span className="brand__tagline">People-Ops request desk</span>
            </span>
          </NavLink>

          <nav className="app-nav" aria-label="Primary">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? "app-nav__link is-active" : "app-nav__link")}
            >
              Queue
            </NavLink>
            <NavLink
              to="/new"
              className={({ isActive }) => (isActive ? "app-nav__link is-active" : "app-nav__link")}
            >
              New request
            </NavLink>
          </nav>

          <div className="app-user">
            {user ? (
              <>
                <span className="app-user__name" data-testid="current-user">
                  {user.name}
                </span>
                <RoleBadge role={user.role} />
                <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
                  Sign out
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <span>EdgeDesk · Hono + D1 + KV + Durable Objects on Cloudflare Workers</span>
      </footer>
    </div>
  );
}
