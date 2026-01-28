import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileSpreadsheet,
  ChevronRight,
  Pause,
  Play,
  Square,
  Loader2,
  Trash2,
  Monitor,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "../lib/api";
import { useBatchActions } from "../hooks/useBatchActions";
import clsx from "clsx";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Batch {
  id: number;
  original_filename: string;
  status: string;
  total_rows: number;
  success_count: number;
  created_at: string;
  error?: string; // 失败时的错误信息
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
  const [errorMessage, setErrorMessage] = useState(initialBatch.error || "");
  const [isDeleting, setIsDeleting] = useState(false);
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
    if (
      status !== "Processing" &&
      status !== "Pending" &&
      status !== "Indexing"
    ) {
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

        if (data.total > 0) {
          console.log(data);
          const processed = data.processed;
          const total = data.total;
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
          if (data.error) {
            setErrorMessage(data.error);
          }
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

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await api.deleteBatch(initialBatch.id);
      toast.success("批次删除成功");
      if (onStatusChange) onStatusChange();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete batch");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <tr className="group hover:bg-muted/40 transition-colors cursor-pointer">
      <td className="py-3 px-4 pl-6" onClick={onRowClick}>
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
      <td className="py-3 px-4" onClick={onRowClick}>
        <div className="flex items-center justify-between w-full h-full min-h-[3rem]">
          {/* Left Side: Status Badge & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <Badge
              variant="outline"
              className={clsx(
                "font-normal border-0 px-2 py-0.5 min-w-[80px] justify-start",
                status === "Completed"
                  ? "bg-green-500/10 text-green-700 hover:bg-green-500/20"
                  : status === "Processing"
                    ? "bg-primary/10 text-primary hover:bg-primary/20"
                    : status === "Indexing"
                      ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                      : status === "Paused"
                        ? "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
              )}
            >
              <span
                className={clsx(
                  "w-1.5 h-1.5 rounded-full mr-1.5",
                  status === "Completed"
                    ? "bg-green-500 shadow-[0_0_5px_#22c55e]"
                    : status === "Processing" || status === "Indexing"
                      ? "bg-primary animate-pulse shadow-[0_0_5px_#3b82f6]"
                      : status === "Paused"
                        ? "bg-amber-500"
                        : "bg-gray-500",
                )}
              />
              {status}
              {(isActionLoading || isDeleting) && (
                <Loader2 className="h-2 w-2 ml-1 animate-spin" />
              )}
            </Badge>

            {/* Actions Inline - Always reserve space or show */}
            <div className="flex items-center gap-1 opacity-100 transition-opacity">
              {/* Monitor Button */}
              {(status === "Processing" ||
                status === "Pending" ||
                status === "Paused") && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/import?batchId=${initialBatch.id}`);
                  }}
                  className="p-1 hover:bg-blue-500/10 text-blue-600 rounded-md transition-colors"
                  title="查看详情"
                >
                  <Monitor className="h-3.5 w-3.5" />
                </button>
              )}

              {status === "Processing" || status === "Pending" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePause();
                  }}
                  disabled={isActionLoading}
                  className="p-1 hover:bg-amber-500/10 text-amber-600 rounded-md disabled:opacity-50 transition-colors"
                  title="暂停"
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
                  className="p-1 hover:bg-green-500/10 text-green-600 rounded-md disabled:opacity-50 transition-colors"
                  title="恢复"
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
                  className="p-1 hover:bg-red-500/10 text-destructive rounded-md disabled:opacity-50 transition-colors"
                  title="停止"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              )}

              {/* Delete Button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    disabled={isDeleting}
                    className="p-1 hover:bg-red-500/10 text-destructive rounded-md disabled:opacity-50 transition-colors ml-1"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除此批次？</AlertDialogTitle>
                    <AlertDialogDescription>
                      此操作将永久删除批次{" "}
                      <strong>{initialBatch.original_filename}</strong>{" "}
                      及其所有关联的记录。此操作不可撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Center/Right: Progress & Stats (Shown if active or paused) */}
          {(status === "Processing" ||
            status === "Pending" ||
            status === "Paused" ||
            status === "Indexing") && (
            <div className="flex flex-col gap-1 w-[220px] ml-4 shrink-0">
              <div className="flex justify-between text-[10px] text-muted-foreground h-3.5 items-center leading-none">
                <span className="tabular-nums">
                  {Math.round((successCount / Math.max(totalRows, 1)) * 100)}%
                </span>
                {(status === "Processing" || status === "Pending") && (
                  <span className="font-mono text-primary animate-pulse ml-auto mr-2">
                    {metrics.speed > 0
                      ? `${(metrics.speed / 1000).toFixed(1)}k/s`
                      : "connecting..."}
                  </span>
                )}
                {status === "Indexing" && (
                  <span className="font-sans text-amber-600 animate-pulse text-[9px] uppercase tracking-wider font-bold ml-auto mr-2">
                    INDEXING
                  </span>
                )}
                {status === "Processing" && metrics.eta > 0 && (
                  <span className="text-[9px] text-muted-foreground/60 font-mono tabular-nums">
                    ETA: {metrics.eta}s
                  </span>
                )}
              </div>
              <Progress
                value={progress}
                className="h-1.5"
                indicatorClassName={clsx(
                  status === "Paused" ? "bg-amber-500" : "bg-blue-500",
                )}
              />
            </div>
          )}

          {/* Failed Message */}
          {status === "Failed" && errorMessage && (
            <span
              className="text-xs text-red-500 truncate max-w-[200px] ml-4 text-right"
              title={errorMessage}
            >
              {errorMessage.length > 30
                ? errorMessage.substring(0, 30) + "..."
                : errorMessage}
            </span>
          )}
        </div>
      </td>
      <td
        className="py-3 px-4 text-right text-muted-foreground font-mono text-xs"
        onClick={onRowClick}
      >
        {new Date(initialBatch.created_at).toLocaleString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </td>
      <td className="py-3 px-4 pr-6 text-right" onClick={onRowClick}>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
      </td>
    </tr>
  );
};
