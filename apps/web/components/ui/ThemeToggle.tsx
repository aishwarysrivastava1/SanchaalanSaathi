"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "md";
}

export function ThemeToggle({ className = "", size = "md" }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`p-2 rounded-lg border transition-all hover:scale-105 active:scale-95
        bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700
        text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200
        hover:border-gray-300 dark:hover:border-gray-600 shadow-sm ${className}`}
    >
      {theme === "dark" ? <Sun size={iconSize} /> : <Moon size={iconSize} />}
    </button>
  );
}
