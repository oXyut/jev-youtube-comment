"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import type { ReactNode } from "react";

const theme = createTheme({
  palette: {
    primary: { main: "#065FD4" },
    text: { primary: "#0F0F0F", secondary: "#606060" },
    background: { default: "#FFFFFF", paper: "#FFFFFF" },
    divider: "#E5E5E5",
  },
  typography: {
    fontFamily: 'Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
    fontSize: 14,
    body1: { fontSize: 14 },
    body2: { fontSize: 14 },
    caption: { fontSize: 12 },
    h1: { fontSize: "1.7rem", fontWeight: 700, lineHeight: 1.5 },
    h2: { fontSize: "1.2rem", fontWeight: 700 },
    h3: { fontSize: "1rem", fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 20 }, outlined: { borderColor: "#D5D9DE" } } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", minHeight: 52, fontSize: 14, fontWeight: 600, color: "#606060", "&.Mui-selected": { color: "#0F0F0F" } } } },
    MuiTabs: { styleOverrides: { indicator: { backgroundColor: "#0F0F0F", height: 3 } } },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiChip: { styleOverrides: { root: { borderRadius: 6, fontWeight: 500 } } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});

export function AppTheme({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>;
}
