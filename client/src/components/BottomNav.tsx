import { Link, useLocation } from "wouter";
import { Home, Users, Trophy, User, Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/teams", icon: Users, label: "Teams" },
  { href: "/games", icon: Trophy, label: "Games" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border"
      data-testid="bottom-nav"
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? location === "/" || location === ""
              : location.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={`flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[48px] rounded-lg transition-colors touch-target
                  ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            </Link>
          );
        })}
        <button
          onClick={toggleTheme}
          className="flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[48px] rounded-lg text-muted-foreground hover:text-foreground transition-colors touch-target"
          data-testid="nav-theme-toggle"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="text-[10px] font-medium">Theme</span>
        </button>
      </div>
    </nav>
  );
}
