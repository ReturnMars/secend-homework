import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Github, BookOpen, Command } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import Dashboard from './components/Dashboard';
import BatchDetail from './components/BatchDetail';
import ErrorBoundary from './components/ErrorBoundary';
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

// 页面过渡配置
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const pageTransition = {
  type: "tween" as const,
  ease: "anticipate" as const,
  duration: 0.4
};

export interface ProcessStats {
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  result_id: string;
  preview_data: Array<any>;
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <motion.div
              initial="initial" animate="animate" exit="exit"
              variants={pageVariants} transition={pageTransition}
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
              initial="initial" animate="animate" exit="exit"
              variants={pageVariants} transition={pageTransition}
              className="flex-1 flex flex-col"
            >
              <BatchDetail />
            </motion.div>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}

function App() {
  return (
    <Router>
      <div className="min-h-screen font-sans antialiased text-foreground selection:bg-primary/10 flex flex-col">

        {/* Background Pattern */}
        <div className="fixed inset-0 -z-10 h-full w-full bg-white bg-[radial-gradient(#94a3b8_1px,transparent_1px)] bg-size-[20px_20px]"></div>

        {/* Navbar */}
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4 sm:px-8">
            <div className="mr-4 flex">
              <Link className="mr-6 flex items-center space-x-2" to="/">
                <div className="h-6 w-6 bg-primary rounded-lg flex items-center justify-center">
                  <Command className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="hidden font-bold sm:inline-block">DataPurifier</span>
              </Link>
              <nav className="flex items-center space-x-6 text-sm font-medium">
                <Link className="transition-colors hover:text-foreground/80 text-foreground/60" to="/">Dashboard</Link>
                <a className="transition-colors hover:text-foreground/80 text-foreground/60" href="#">History</a>
              </nav>
            </div>
            <div className="flex flex-1 items-center justify-end space-x-2">
              <nav className="flex items-center space-x-2">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Github className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <BookOpen className="h-4 w-4" />
                </Button>
                <Button size="sm" className="ml-2 hidden md:flex">Sign In</Button>
              </nav>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col relative overflow-hidden min-h-[calc(100vh-3.5rem)]">
          <ErrorBoundary>
            <AnimatedRoutes />
          </ErrorBoundary>
        </main>

        {/* Footer */}
        <footer className="w-full border-t border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 py-6 mt-auto">
          <div className="container max-w-screen-2xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">DataPurifier</span>
              <span>© 2026 Data Governance Team. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-foreground transition-colors">Documentation</a>
              <a href="#" className="hover:text-foreground transition-colors">API Status</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            </div>
          </div>
        </footer>
        <Toaster position="top-center" richColors />
      </div>
    </Router>
  );
}

export default App;
