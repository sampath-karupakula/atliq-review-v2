"use client";

import { useEffect } from "react";
import { applyTheme, readTheme } from "./theme";

// Applies the stored theme choice before the first paint settles. System is the default, so most viewers see no change.
export function ThemeInit() {
  useEffect(() => {
    applyTheme(readTheme());
  }, []);
  return null;
}
