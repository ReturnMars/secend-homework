import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

// Context
import { AuthProvider, useAuth } from "./context/AuthContext";

// Layout & Pages
import MainLayout from "./layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import BatchDetail from "./pages/BatchDetail";
import History from "./pages/History";
import Login from "./pages/Login";
import ErrorBoundary from "./components/ErrorBoundary";

// 页面过渡配置
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

const pageTransition = {
  type: "tween" as const,
  ease: "easeInOut" as const,
  duration: 0.2,
};

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <motion.div
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
              transition={pageTransition}
              className="flex-1 flex flex-col"
            >
              <Dashboard />
            </motion.div>
          }
        />
        <Route
          path="/batches/:id"
          element={
            <motion.div
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
              transition={pageTransition}
              className="flex-1 flex flex-col"
            >
              <BatchDetail />
            </motion.div>
          }
        />
        <Route
          path="/history"
          element={
            <motion.div
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
              transition={pageTransition}
              className="flex-1 flex flex-col"
            >
              <History />
            </motion.div>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <Router>
      <AuthProvider>
        <TooltipProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <MainLayout>
                    <ErrorBoundary>
                      <AnimatedRoutes />
                    </ErrorBoundary>
                  </MainLayout>
                </RequireAuth>
              }
            />
          </Routes>
        </TooltipProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
