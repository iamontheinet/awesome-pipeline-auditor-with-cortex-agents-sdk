import { AppThemeProvider } from "./ThemeContext";
import { AuditDashboard } from "./components/AuditDashboard";

export default function App() {
  return (
    <AppThemeProvider>
      <AuditDashboard />
    </AppThemeProvider>
  );
}
