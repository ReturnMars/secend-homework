import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Github, BookOpen, Command } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isAuthenticated, user, logout } = useAuth();
  return (
    <>
      <TooltipProvider>
        <OverlayScrollbarsComponent
          defer
          options={{ scrollbars: { autoHide: "scroll", clickScroll: true } }}
          className="h-screen w-full"
        >
          <div className="min-h-screen font-sans antialiased text-foreground selection:bg-primary/10 flex flex-col relative">
            {/* Background Pattern */}
            <div className="fixed inset-0 -z-10 h-full w-full bg-white bg-[radial-gradient(#94a3b8_1px,transparent_1px)] bg-size-[20px_20px] pointer-events-none"></div>

            {/* Navbar */}
            <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
              <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4 sm:px-8">
                <div className="mr-4 flex">
                  <Link className="mr-6 flex items-center space-x-2" to="/">
                    <div className="h-6 w-6 bg-primary rounded-lg flex items-center justify-center">
                      <Command className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <span className="hidden font-bold sm:inline-block">
                      DataPurifier
                    </span>
                  </Link>
                  <nav className="flex items-center space-x-6 text-sm font-medium">
                    <Link
                      className="transition-colors hover:text-foreground/80 text-foreground/60"
                      to="/"
                    >
                      控制面板
                    </Link>
                    <Link
                      className="transition-colors hover:text-foreground/80 text-foreground/60"
                      to="/history"
                    >
                      历史记录
                    </Link>
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
                    {isAuthenticated ? (
                      <div className="flex items-center gap-2 ml-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                          {user?.username?.[0]?.toUpperCase() || "U"}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={logout}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          退出登录
                        </Button>
                      </div>
                    ) : (
                      <Link to="/login">
                        <Button size="sm" className="ml-2 hidden md:flex">
                          登录
                        </Button>
                      </Link>
                    )}
                  </nav>
                </div>
              </div>
            </header>

            <main className="flex-1 flex flex-col relative min-h-[calc(100vh-3.5rem)]">
              {children}
            </main>

            {/* Footer */}
            <footer className="w-full border-t border-border/40 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 py-6 mt-auto">
              <div className="container max-w-screen-2xl mx-auto px-4 sm:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    DataPurifier
                  </span>
                  <span>© 2026 数据治理团队. 保留所有权利.</span>
                </div>
                <div className="flex items-center gap-6">
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    帮助文档
                  </a>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    服务状态
                  </a>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    服务条款
                  </a>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    隐私政策
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </OverlayScrollbarsComponent>
      </TooltipProvider>
      <Toaster position="top-center" richColors />
    </>
  );
}
