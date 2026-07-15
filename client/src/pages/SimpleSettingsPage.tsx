import { KeyRound, MonitorCog, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { AuthBootstrapStatus, WhoAmIResult } from "../api/sitesApi";
import { ProductPage, ProductSection } from "../components/product/ProductPage";
import { presentVisibleRole } from "../domain/presentation";

type AuthUser = NonNullable<WhoAmIResult["user"]>;

export function SimpleSettingsPage({
  authUser,
  authChecking,
  onLogout
}: {
  authUser: AuthUser;
  authChecking: boolean;
  authBootstrapStatus: AuthBootstrapStatus | null;
  authError: string;
  onLogin: (personalNumber: string) => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshAuth: () => Promise<void>;
}) {
  const visibleRole = presentVisibleRole(authUser.role);
  const [theme, setThemeState] = useState<"light" | "dark">(() => document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const setTheme = (theme: "light" | "dark") => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("sitebuilder-hub-theme", theme);
    setThemeState(theme);
    window.dispatchEvent(new CustomEvent("sitebuilder-hub-theme-change", { detail: theme }));
  };

  return (
    <ProductPage title="הגדרות" description="מראה, תפקיד וחיבור המשתמש הנוכחי.">
      <div className="normal-settings-grid">
        <ProductSection title="מראה">
          <div className="normal-theme-options" role="group" aria-label="בחירת ערכת נושא">
            <button className={theme === "light" ? "is-selected" : ""} aria-pressed={theme === "light"} type="button" onClick={() => setTheme("light")}><Sun size={20} /><span><strong>בהיר</strong><small>רקע בהיר וניגודיות גבוהה</small></span></button>
            <button className={theme === "dark" ? "is-selected" : ""} aria-pressed={theme === "dark"} type="button" onClick={() => setTheme("dark")}><Moon size={20} /><span><strong>כהה</strong><small>מתאים לעבודה בתאורה חלשה</small></span></button>
          </div>
        </ProductSection>

        <ProductSection title="המשתמש הנוכחי">
          <dl className="normal-session-facts">
            <div><dt>שם</dt><dd>{authUser.name || "משתמש מחובר"}</dd></div>
            <div><dt>תפקיד</dt><dd>{visibleRole === "admin" ? "מנהל" : "צופה"}</dd></div>
            <div><dt>מצב</dt><dd>{authChecking ? "בודק חיבור" : "מחובר"}</dd></div>
          </dl>
          <button className="btn btn-secondary" type="button" onClick={() => void onLogout()}><KeyRound size={17} />יציאה</button>
        </ProductSection>
      </div>

      {visibleRole === "admin" ? (
        <div className="normal-advanced-link normal-settings-advanced">
          <MonitorCog size={18} aria-hidden="true" />
          <div><strong>הגדרות מתקדמות</strong><span>חיבורים, כתובות מערכת ופרטי תמיכה.</span></div>
          <Link to="/advanced/settings">פתיחה</Link>
        </div>
      ) : null}
    </ProductPage>
  );
}
