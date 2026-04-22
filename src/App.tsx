import { ThemeProvider, CssBaseline } from "@mui/material";
import { theme } from "./theme";
import { AuditDashboard } from "./components/AuditDashboard";

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuditDashboard />
    </ThemeProvider>
  );
}
