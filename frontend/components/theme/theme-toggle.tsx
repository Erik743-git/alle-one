"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyTheme,
  setStoredTheme,
  type ThemeMode,
} from "@/lib/theme";

export default function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  function toggle() {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setStoredTheme(next);
    applyTheme(next);
    setTheme(next);
  }

  const isDark = theme === "dark";

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={toggle}
      className={
        collapsed
          ? "h-10 w-10 shrink-0 rounded-xl border-border bg-card/60 p-0 text-foreground hover:bg-accent hover:text-accent-foreground"
          : "h-9 w-9 rounded-xl border-border bg-card/60 p-0 text-foreground hover:bg-accent hover:text-accent-foreground"
      }
      title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
    >
      {isDark ? <Sun size={collapsed ? 18 : 16} /> : <Moon size={collapsed ? 18 : 16} />}
    </Button>
  );
}

