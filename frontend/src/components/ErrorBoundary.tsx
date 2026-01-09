import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from "@/components/ui/button";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary 组件
 * 
 * 捕获子组件树中的 JavaScript 错误，防止整个应用崩溃白屏。
 * 当错误发生时，显示友好的回退 UI。
 */
class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): Partial<State> {
        // 更新 state 以便下次渲染时显示回退 UI
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // 记录错误信息（可扩展为发送到日志服务）
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    private handleReload = (): void => {
        // 重新加载页面
        window.location.reload();
    };

    private handleGoHome = (): void => {
        // 返回首页并清除错误状态
        window.location.href = '/';
    };

    private handleRetry = (): void => {
        // 尝试重新渲染子组件
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    public render(): ReactNode {
        if (this.state.hasError) {
            // 如果提供了自定义 fallback，使用它
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // 默认的错误回退 UI
            return (
                <div className="min-h-[60vh] flex items-center justify-center p-8">
                    <div className="max-w-md w-full text-center space-y-6">
                        {/* 错误图标 */}
                        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                        </div>

                        {/* 标题和描述 */}
                        <div className="space-y-2">
                            <h2 className="text-2xl font-bold tracking-tight text-foreground">
                                页面遇到了问题
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                抱歉，页面在渲染时遇到了意外错误。你可以尝试刷新页面或返回首页。
                            </p>
                        </div>

                        {/* 错误详情（开发模式下显示） */}
                        {import.meta.env.DEV && this.state.error && (
                            <div className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-left">
                                <p className="text-xs font-mono text-red-700 dark:text-red-400 break-all">
                                    <span className="font-semibold">Error:</span> {this.state.error.message}
                                </p>
                                {this.state.errorInfo?.componentStack && (
                                    <details className="mt-2">
                                        <summary className="text-xs text-red-600 dark:text-red-500 cursor-pointer hover:underline">
                                            查看组件堆栈
                                        </summary>
                                        <pre className="mt-2 text-[10px] text-red-600/80 dark:text-red-400/80 whitespace-pre-wrap max-h-40 overflow-auto">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}

                        {/* 操作按钮 */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                            <Button onClick={this.handleRetry} variant="default" className="gap-2">
                                <RotateCcw className="h-4 w-4" />
                                重试
                            </Button>
                            <Button onClick={this.handleReload} variant="outline" className="gap-2">
                                刷新页面
                            </Button>
                            <Button onClick={this.handleGoHome} variant="ghost" className="gap-2">
                                <Home className="h-4 w-4" />
                                返回首页
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
