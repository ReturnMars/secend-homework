import React, { useState, useEffect } from "react";
import {
  Zap,
  CheckCircle2,
  Loader2,
  Minimize2,
  Maximize2,
  X,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import clsx from "clsx";
import { api } from "../lib/api";

interface TaskMiniPlayerProps {
  batchId: string;
  onClose: () => void;
}

const TaskMiniPlayer: React.FC<TaskMiniPlayerProps> = ({
  batchId,
  onClose,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<string>("Processing");
  const [metrics, setMetrics] = useState({
    processed: 0,
    total: 0,
    speed: 0,
    eta: 0,
  });

  useEffect(() => {
    const evtSource = api.getProgressSource(batchId);

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data.status);

        if (data.total_rows > 0) {
          const processed = data.processed_rows;
          const total = data.total_rows;
          const percent = Math.round((processed / total) * 100);

          // 直接使用后端推送的实时速度
          const speed = data.speed || 0;
          let eta = 0;

          if (speed > 0) {
            eta = Math.ceil((total - processed) / speed);
          }

          setProgress(percent);
          setMetrics({ processed, total, speed, eta });
        }

        if (data.status === "Completed" || data.status === "Failed") {
          evtSource.close();
        }
      } catch (e) {
        console.error("MiniPlayer SSE Error", e);
      }
    };

    return () => evtSource.close();
  }, [batchId]);

  const formatTime = (s: number) => {
    if (s <= 0) return "--";
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return m > 0 ? `${m}m${rs}s` : `${rs}s`;
  };

  if (status === "Completed" && !isMinimized) {
    // Keep it visible briefly but allow close
  }

  return (
    <Card
      className={clsx(
        "relative z-[100] transition-all duration-500 ease-in-out shadow-2xl border-primary/20",
        "bg-background/80 backdrop-blur-xl",
        isMinimized ? "w-64 p-3" : "w-[340px] p-5"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            className={clsx(
              "p-1.5 rounded-lg shrink-0",
              status === "Completed"
                ? "bg-green-500/20 text-green-500"
                : "bg-primary/20 text-primary"
            )}
          >
            {status === "Completed" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black uppercase tracking-tighter truncate">
              Pipeline {batchId}
            </h4>
            <p className="text-[10px] text-muted-foreground font-mono leading-none">
              {status === "Completed" ? "Mission Success" : "ETL Active"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            {isMinimized ? (
              <Maximize2 className="h-3.5 w-3.5" />
            ) : (
              <Minimize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded-md transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/30 p-2 rounded-lg">
              <span className="text-[8px] uppercase font-black opacity-40 block mb-0.5">
                Speed
              </span>
              <span className="text-sm font-mono font-black">
                {status === "Completed" && metrics.speed === 0
                  ? "CACHED"
                  : `${(metrics.speed / 1000).toFixed(1)}k`}
                {!(status === "Completed" && metrics.speed === 0) && (
                  <span className="text-[10px] font-normal opacity-60 ml-0.5">
                    r/s
                  </span>
                )}
              </span>
            </div>
            <div className="bg-primary/5 p-2 rounded-lg">
              <span className="text-[8px] uppercase font-black opacity-40 block mb-0.5">
                {status === "Completed" ? "Status" : "Time Left"}
              </span>
              <span className="text-sm font-mono font-black text-primary">
                {status === "Completed" ? "DONE" : formatTime(metrics.eta)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="opacity-60">
                {metrics.processed.toLocaleString()} rows
              </span>
              <span className="font-bold">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </div>
      )}

      {isMinimized && (
        <div className="mt-2 animate-in fade-in">
          <Progress value={progress} className="h-1" />
          <div className="flex justify-between items-center mt-1.5 px-0.5">
            <span className="text-[9px] font-mono opacity-60">
              {progress}% Processed
            </span>
            <div className="flex items-center gap-1">
              <Zap className="h-2.5 w-2.5 text-primary" />
              <span className="text-[9px] font-mono font-bold text-primary">
                {status === "Completed" ? "DONE" : formatTime(metrics.eta)}
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default TaskMiniPlayer;
