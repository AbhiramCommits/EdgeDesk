import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { ToastProvider } from "./components/ui/Toast";
import { LoginPage } from "./pages/LoginPage";
import { NewRequestPage } from "./pages/NewRequestPage";
import { QueuePage } from "./pages/QueuePage";
import { RequestDetailPage } from "./pages/RequestDetailPage";

/**
 * Pages routing split (documented in public/_redirects):
 *   Browser -> Pages static bundle (this SPA) for every non-/api path
 *   Browser -> Worker for /api/*, proxied by Pages in production and by Vite
 *   in local dev/preview. Session cookies therefore stay same-site.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<QueuePage />} />
                <Route path="new" element={<NewRequestPage />} />
                <Route path="requests/:id" element={<RequestDetailPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
