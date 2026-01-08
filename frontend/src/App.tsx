import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Github, BookOpen, Menu, Sparkles, Command } from 'lucide-react';
import UploadZone from './components/UploadZone';
import ReportCard from './components/ReportCard';
import { Button } from "@/components/ui/button";

export interface ProcessStats {
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  result_id: string;
  preview_data: Array<{
    name: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    join_date: string;
    status: string;
    original_address: string;
  }>;
}

function App() {
  const [stats, setStats] = useState<ProcessStats | null>(null);

  return (
    <div className="min-h-screen font-sans antialiased text-foreground selection:bg-primary/10">

      {/* Background Pattern - High Contrast Dot Grid */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-white bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:20px_20px]"></div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4 sm:px-8">
          <div className="mr-4 flex">
            <a className="mr-6 flex items-center space-x-2" href="#">
              <div className="h-6 w-6 bg-primary rounded-lg flex items-center justify-center">
                <Command className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="hidden font-bold sm:inline-block">DataPurifier</span>
            </a>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <a className="transition-colors hover:text-foreground/80 text-foreground/60" href="#">Features</a>
              <a className="transition-colors hover:text-foreground/80 text-foreground/60" href="#">Enterprise</a>
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

      <main className="flex-1">
        <div className="container relative pb-10 mx-auto px-4 sm:px-8 max-w-screen-xl">

          {/* Hero Section */}
          {!stats && (
            <section className="mx-auto flex max-w-[980px] flex-col items-center gap-2 pt-6 pb-2 md:pt-8 md:pb-4 lg:pt-10 lg:pb-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center text-center gap-4"
              >
                <span className="rounded-2xl bg-muted px-4 py-1.5 text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>New v2.0 Parsing Engine is live</span>
                </span>

                <h1 className="text-center text-3xl font-bold leading-tight tracking-tighter md:text-6xl lg:leading-[1.1]">
                  Data Cleaning, <br />
                  <span className="bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">Reimagined for Humans.</span>
                </h1>

                <p className="max-w-[750px] text-center text-lg text-muted-foreground sm:text-xl">
                  Transform messy Excel and CSV files into pristine, structured data in seconds.
                  Powered by local processing for maximum security.
                </p>
              </motion.div>
            </section>
          )}

          {/* Application Area */}
          <section className="relative z-10 w-full max-w-5xl mx-auto mt-8">
            <AnimatePresence mode="wait">
              {!stats ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <UploadZone onSuccess={setStats} />
                </motion.div>
              ) : (
                <motion.div
                  key="report"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                >
                  <ReportCard stats={stats} onReset={() => setStats(null)} />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-16 pb-8">
        <div className="container mx-auto px-4 max-w-screen-xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            {/* Brand Column */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10">
                  <Command className="h-5 w-5 text-primary" />
                </div>
                <span className="font-bold text-lg tracking-tight">DataPurifier</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                The professional ETL solution for messy data. Clean, standardize, and export with enterprise precision.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-xs font-medium text-muted-foreground">System Operational</span>
              </div>
            </div>

            {/* Product Column */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm tracking-tight text-foreground">Product</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Integrations</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Enterprise</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Changelog</a></li>
              </ul>
            </div>

            {/* Resources Column */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm tracking-tight text-foreground">Resources</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Documentation</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">API Reference</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Community</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
              </ul>
            </div>

            {/* Company & Legal Column */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm tracking-tight text-foreground">Company</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-8 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <p>© 2026 Data Governance Team. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="hover:text-foreground transition-colors flex items-center gap-2">
                <Github className="h-4 w-4" />
                <span>GitHub</span>
              </a>
              <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
              <a href="#" className="hover:text-foreground transition-colors">Discord</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
