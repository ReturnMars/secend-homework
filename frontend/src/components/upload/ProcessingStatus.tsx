import React from "react";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  BarChart3,
  Pause,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProcessingStatusProps {
  status: string;
  phase: "idle" | "uploading" | "processing" | "completed" | "error";
  metrics: {
    total: number;
    success: number;
    failed: number;
    processed: number;
    elapsed: number;
    eta: number;
    speed: number;
  };
  processProgress: number;
  isActionLoading: boolean;
  onPause: () => void;

  onCancel: () => void;
  onReset?: () => void;
  formatTime: (seconds: number) => string;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  status,
  phase,
  metrics,
  processProgress,
  isActionLoading,
  onPause,
  onCancel,
  onReset,
  formatTime,
}) => {
  return (
    <div className="space-y-8">
      {/* Header Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg",
              phase === "completed"
                ? "bg-green-500 text-white shadow-green-500/20"
                : phase === "error"
                  ? "bg-destructive text-destructive-foreground shadow-destructive/20"
                  : "bg-primary text-primary-foreground shadow-primary/20 animate-pulse",
            )}
          >
            {phase === "completed" ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : phase === "error" ? (
              <AlertCircle className="h-6 w-6" />
            ) : (
              <Activity className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black uppercase tracking-widest">
                {status}
              </h3>
              <Badge variant="outline" className="font-bold">
                当前阶段:{" "}
                {phase === "uploading"
                  ? "上传中"
                  : phase === "processing"
                    ? "清洗中"
                    : phase === "completed"
                      ? "已完成"
                      : "空闲"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium">
              {phase === "processing"
                ? "引擎正在校验并清洗记录..."
                : phase === "completed"
                  ? "所有记录处理完毕。"
                  : "等待操作..."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {phase === "processing" && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={onPause}
                disabled={isActionLoading}
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={onCancel}
                className="text-destructive hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress Section */}
      <div className="space-y-3">
        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">
          <span>整体进度</span>
          <span className="text-primary">{Math.round(processProgress)}%</span>
        </div>
        <Progress value={processProgress} className="h-3" />
      </div>

      {/* Grid Metrics */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-primary/5 rounded-[24px] p-5 border border-primary/10 group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              处理效率
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black">{metrics.speed}</span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase">
              行/秒
            </span>
          </div>
        </div>

        <div className="bg-primary/5 rounded-[24px] p-5 border border-primary/10 group hover:border-primary/30 transition-colors">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
              <Clock className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              预计剩余时间
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-black">
              {formatTime(metrics.eta)}
            </span>
          </div>
        </div>

        <div className="bg-primary/5 rounded-[24px] p-5 border border-primary/10 group hover:border-primary/30 transition-colors col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <BarChart3 className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                记录分布
              </span>
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest">
              {metrics.processed} / {metrics.total}
            </div>
          </div>

          <div className="flex h-2 w-full rounded-full overflow-hidden bg-primary/5">
            <motion.div
              className="bg-green-500"
              initial={{ width: 0 }}
              animate={{
                width:
                  metrics.total > 0
                    ? `${(metrics.success / metrics.total) * 100}%`
                    : "0%",
              }}
            />
            <motion.div
              className="bg-destructive"
              initial={{ width: 0 }}
              animate={{
                width:
                  metrics.total > 0
                    ? `${(metrics.failed / metrics.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
          <div className="flex justify-between mt-3 px-1">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                清洗成功: {metrics.success}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                校验失败: {metrics.failed}
              </span>
            </div>
          </div>
        </div>
      </div>

      {phase === "completed" && onReset && (
        <div className="mt-8 pt-6 border-t border-primary/10 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-primary hover:text-primary font-black uppercase tracking-widest"
          >
            开启新流水线
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProcessingStatus;
