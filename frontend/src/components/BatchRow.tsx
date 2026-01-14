import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileSpreadsheet,
  ChevronRight,
  Pause,
  Play,
  Square,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "../lib/api";
import { useBatchActions } from "../hooks/useBatchActions";
import clsx from "clsx";

interface Batch {
  id: number;
  original_filename: string;
  status: string;
  total_rows: number;
  success_count: number;
  created_at: string;
}

interface BatchRowProps {
  batch: Batch;
  onStatusChange?: () => void;
}

export const BatchRow: React.FC<BatchRowProps> = ({
  batch: initialBatch,
  onStatusChange,
}) => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(initialBatch.status);
  const [successCount, setSuccessCount] = useState(initialBatch.success_count);
  const [totalRows, setTotalRows] = useState(initialBatch.total_rows);
  const [metrics, setMetrics] = useState({
    speed: 0,
    eta: 0,
  });

  const { handlePause, handleResume, handleCancel, isActionLoading } =
    useBatchActions(initialBatch.id.toString(), () => {
      if (onStatusChange) onStatusChange();
    });

  useEffect(() => {
    // 同步外部状态（可选，主要依赖 SSE）
    setStatus(initialBatch.status);
    setSuccessCount(initialBatch.success_count);
    setTotalRows(initialBatch.total_rows);
  }, [initialBatch]);

  useEffect(() => {
    if (status !== "Processing" && status !== "Pending") {
      if (totalRows > 0) {
        setProgress(Math.round((successCount / totalRows) * 100));
      }
      return;
    }

    const evtSource = api.getProgressSource(initialBatch.id.toString());

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStatus(data.status);

        if (data.total_rows > 0) {
          console.log(data);
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
          setSuccessCount(processed);
          setTotalRows(total);
          setMetrics({ speed, eta });
        }

        if (data.status === "Completed" || data.status === "Failed") {
          evtSource.close();
          if (onStatusChange) onStatusChange();
        }
      } catch (e) {
        console.error("BatchRow SSE Error", e);
      }
    };

    return () => evtSource.close();
  }, [initialBatch.id, status]);

  const onRowClick = () => {
    navigate(`/batches/${initialBatch.id}`);
  };

  return (
    <tr
      className="group hover:bg-muted/40 transition-colors cursor-pointer"
      onClick={onRowClick}
    >
      <td className="py-3 px-4 pl-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-105 transition-transform">
            <FileSpreadsheet className="h-4 w-4" />
          </div>
          <div>
            <div className="font-medium text-foreground">
              {initialBatch.original_filename}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5 opacity-70">
              ID: {initialBatch.id}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex flex-col gap-1.5 max-w-[180px]">
          <div className="flex justify-between text-[10px] text-muted-foreground h-4">
            <span>
              {successCount.toLocaleString()} / {totalRows.toLocaleString()}
            </span>
            {(status === "Processing" || status === "Pending") && (
              <span className="font-mono text-primary animate-pulse">
                {metrics.speed > 0
                  ? `${(metrics.speed / 1000).toFixed(1)}k/s`
                  : "connecting..."}
              </span>
            )}
          </div>
          <Progress
            value={progress}
            className="h-1.5"
            indicatorClassName={clsx(
              status === "Completed"
                ? "bg-green-500"
                : status === "Failed"
                ? "bg-red-500"
                : status === "Paused"
                ? "bg-amber-500"
                : "bg-blue-500"
            )}
          />
          {status === "Processing" && metrics.eta > 0 && (
            <div className="text-[9px] text-muted-foreground/60 text-right font-mono">
              ETA: {metrics.eta}s
            </div>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={clsx(
              "font-normal border-0 px-2 py-0.5 min-w-[80px] justify-start",
              status === "Completed"
                ? "bg-green-500/10 text-green-700 hover:bg-green-500/20"
                : status === "Processing"
                ? "bg-primary/10 text-primary hover:bg-primary/20"
                : status === "Paused"
                ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            )}
          >
            <span
              className={clsx(
                "w-1.5 h-1.5 rounded-full mr-1.5",
                status === "Completed"
                  ? "bg-green-500 shadow-[0_0_5px_#22c55e]"
                  : status === "Processing"
                  ? "bg-primary animate-pulse shadow-[0_0_5px_#3b82f6]"
                  : status === "Paused"
                  ? "bg-amber-500"
                  : "bg-gray-500"
              )}
            />
            {status}
            {isActionLoading && (
              <Loader2 className="h-2 w-2 ml-1 animate-spin" />
            )}
          </Badge>

          {/* Actions Inline */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            {status === "Processing" || status === "Pending" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePause();
                }}
                disabled={isActionLoading}
                className="p-1 hover:bg-amber-500/10 text-amber-600 rounded-md disabled:opacity-50"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
            ) : status === "Paused" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleResume();
                }}
                disabled={isActionLoading}
                className="p-1 hover:bg-green-500/10 text-green-600 rounded-md disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            ) : null}

            {(status === "Processing" ||
              status === "Pending" ||
              status === "Paused") && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
                disabled={isActionLoading}
                className="p-1 hover:bg-red-500/10 text-destructive rounded-md disabled:opacity-50"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-4 text-right text-muted-foreground font-mono text-xs">
        {new Date(initialBatch.created_at).toLocaleString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </td>
      <td className="py-3 px-4 pr-6 text-right">
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
      </td>
    </tr>
  );
};
