import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  File as FileIcon,
  X,
  Clock,
  CheckCircle2,
  Zap,
  Loader2,
  Pause,
  Play,
  Square,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { api } from "../lib/api";
import { useBatchActions } from "../hooks/useBatchActions";
import { sha256 } from "js-sha256";

export interface ProcessStats {
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  result_id: string;
  preview_data: Array<any>;
}

interface UploadZoneProps {
  onSuccess: (stats: ProcessStats, fileName?: string) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processProgress, setProcessProgress] = useState(0);
  const [phase, setPhase] = useState<
    "idle" | "hashing" | "uploading" | "processing"
  >("idle");
  const [status, setStatus] = useState<string>("Pending");
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processingStartTimeRef = useRef<number>(0);

  const [metrics, setMetrics] = useState({
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    elapsed: 0,
    eta: 0,
    speed: 0,
  });

  useEffect(() => {
    let timer: number;
    if (phase === "processing" && processingStartTimeRef.current > 0) {
      setMetrics((prev) => ({ ...prev, elapsed: 0 }));
      timer = window.setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor(
          (now - processingStartTimeRef.current) / 1000
        );
        if (elapsed >= 0 && elapsed < 86400) {
          setMetrics((prev) => ({ ...prev, elapsed }));
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [phase]);

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      if (uploading) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") {
        setIsDragging(true);
      } else if (e.type === "dragleave") {
        setIsDragging(false);
      }
    },
    [uploading]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (uploading) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        validateAndSetFile(e.dataTransfer.files[0]);
      }
    },
    [uploading]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validTypes = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    const isCsvOrExcel =
      validTypes.includes(file.type) ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".xlsx");

    if (isCsvOrExcel) {
      setFile(file);
      setError(null);
      setUploadProgress(0);
      setProcessProgress(0);
    } else {
      setError("Please upload a valid CSV or Excel file.");
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 0 || isNaN(seconds)) return "--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setPhase("hashing"); // 标记为正在计算特征
    setUploadProgress(0);
    setProcessProgress(0);
    setMetrics({
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      elapsed: 0,
      eta: 0,
      speed: 0,
    });

    try {
      // 1. 生成极速指纹 (针对 2GB 采样) - 使用 js-sha256 兼容非 HTTPS 环境
      let fileHash = "";
      try {
        const SAMPLE_SIZE = 1024 * 1024; // 1MB
        const head = file.slice(0, SAMPLE_SIZE);
        const tail = file.slice(Math.max(0, file.size - SAMPLE_SIZE));
        const metaStr = `${file.size}-${file.lastModified}`;
        const combinedBuffer = await new Blob([
          head,
          tail,
          new TextEncoder().encode(metaStr),
        ]).arrayBuffer();

        fileHash = sha256(combinedBuffer);
        console.log("[Hash] Fast Fingerprint generated (Library):", fileHash);

        // 2. 秒传预检 (仅在有 Hash 时执行)
        const checkRes = await api.checkHash(fileHash);
        if (
          checkRes &&
          (checkRes as any).exists &&
          (checkRes as any).batch_id
        ) {
          console.log("[Instant Upload] File found on server.");
          const b_id = (checkRes as any).batch_id.toString();
          setBatchId(b_id);
          setUploadProgress(100);
          setPhase("processing");
          processingStartTimeRef.current = Date.now();
          startSSE(b_id);
          return;
        }
      } catch (checkErr) {
        console.warn(
          "[Instant Check] Hash computation or check failed",
          checkErr
        );
      }

      // 3. 正常上传流程
      setPhase("uploading");
      const res = await api.upload<{ batch_id: string }>(
        "/upload",
        file,
        (p) => setUploadProgress(p),
        { hash: fileHash }
      );

      const { batch_id } = res;
      setBatchId(batch_id.toString());
      setPhase("processing");
      processingStartTimeRef.current = Date.now();
      startSSE(batch_id.toString());
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setUploading(false);
      setPhase("idle");
    }
  };

  const startSSE = (batch_id: string) => {
    const evtSource = api.getProgressSource(batch_id);

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
            const remaining = total - processed;
            eta = Math.ceil(remaining / speed);
          }

          setProcessProgress(percent);
          setMetrics((prev) => ({
            ...prev,
            total,
            processed,
            success: data.filters?.success || 0,
            failed: data.filters?.failed || 0,
            speed: Math.round(speed),
            eta,
          }));
        }

        if (data.status === "Completed") {
          evtSource.close();
          setProcessProgress(100);
          setTimeout(() => {
            onSuccess({
              total_rows: data.total_rows,
              success_rows: data.filters?.success || 0,
              failed_rows: data.filters?.failed || 0,
              result_id: batch_id,
              preview_data: [],
            });
          }, 500);
        } else if (data.status === "Failed") {
          evtSource.close();
          setError(data.error || "Critical processing error");
          setUploading(false);
          setPhase("idle");
        }
      } catch (e) {
        console.error("SSE Parse Error", e);
      }
    };

    evtSource.onerror = (err) => {
      console.error("SSE Error", err);
      evtSource.close();
      if (processProgress < 100) {
        setError(
          "Connection lost during processing. You can try to resume later."
        );
        setUploading(false);
        setPhase("idle");
      }
    };
  };
  const triggerFileInput = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (uploading) return;
    setFile(null);
    setBatchId(null);
    setStatus("Pending");
    setError(null);
    setUploadProgress(0);
    setProcessProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const { handlePause, handleResume, handleCancel, isActionLoading } =
    useBatchActions(batchId || undefined);

  return (
    <div className="w-full space-y-6">
      <div
        onClick={triggerFileInput}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={clsx(
          "relative rounded-xl p-10 transition-all duration-200 ease-in-out flex flex-col items-center justify-center gap-4 group",
          !uploading && "cursor-pointer hover:bg-muted/60",
          uploading && "cursor-default",
          isDragging
            ? "bg-primary/5 ring-2 ring-primary ring-inset"
            : "bg-muted/30",
          file
            ? "border-solid border-primary/20"
            : "border-2 border-dashed border-muted-foreground/20"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept=".csv, .xlsx"
          disabled={uploading}
        />

        {file ? (
          <div className="w-full space-y-4 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-4 p-4 bg-background rounded-lg border shadow-sm relative">
              <div className="p-2 bg-primary/10 rounded-full text-primary">
                <FileIcon className="h-6 w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={clearFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {uploading && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1.5 grayscale">
                      <UploadCloud className="h-3.5 w-3.5" />
                      {phase === "hashing" ? (
                        <span className="flex items-center gap-1.5 text-primary">
                          0. Scanning File Fingerprint...
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      ) : phase === "uploading" ? (
                        "1. Network Inbound"
                      ) : (
                        "1. Upload Success"
                      )}
                    </span>
                    <span className="font-mono">
                      {phase === "uploading"
                        ? `${uploadProgress}%`
                        : phase === "hashing"
                        ? "0%"
                        : "100%"}
                    </span>
                  </div>
                  <Progress
                    value={
                      phase === "uploading"
                        ? uploadProgress
                        : phase === "hashing"
                        ? 0
                        : 100
                    }
                    className="h-1"
                  />
                </div>

                {phase === "processing" && (
                  <div className="p-5 bg-card/50 rounded-2xl space-y-5 border border-primary/10 shadow-inner animate-in fade-in zoom-in-95 duration-500">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                      <MetricItem
                        label="Total"
                        value={`${(metrics.total / 10000).toFixed(1)}w`}
                      />
                      <MetricItem
                        label="Cleaned"
                        value={`${(metrics.success / 10000).toFixed(1)}w`}
                        color="text-green-500"
                      />
                      <MetricItem
                        label="Dirty"
                        value={`${(metrics.failed / 10000).toFixed(1)}w`}
                        color="text-amber-500"
                      />
                      <MetricItem
                        label="Speed"
                        value={
                          processProgress === 100 && metrics.speed === 0
                            ? "CACHED"
                            : `${(metrics.speed / 1000).toFixed(1)}k`
                        }
                        unit={
                          processProgress === 100 && metrics.speed === 0
                            ? ""
                            : "r/s"
                        }
                        hasZap
                      />
                    </div>

                    <div className="space-y-3 pt-2">
                      {/* Row 1: Title & Controls */}
                      <div className="flex justify-between items-center h-8">
                        <span className="flex items-center gap-2 text-xs font-bold text-primary">
                          <CheckCircle2 className="h-4 w-4" />
                          2. ETL Pipeline Processing
                        </span>

                        {/* Controls */}
                        <div className="flex items-center gap-1">
                          {(status === "Processing" ||
                            status === "Pending") && (
                            <button
                              onClick={handlePause}
                              disabled={isActionLoading}
                              className="p-1.5 hover:bg-amber-500/10 text-amber-600 rounded-md transition-colors disabled:opacity-50"
                              title="Pause"
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Pause className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {status === "Paused" && (
                            <button
                              onClick={handleResume}
                              disabled={isActionLoading}
                              className="p-1.5 hover:bg-green-500/10 text-green-600 rounded-md transition-colors disabled:opacity-50"
                              title="Resume"
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Play className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                          {(status === "Processing" ||
                            status === "Pending" ||
                            status === "Paused") && (
                            <button
                              onClick={handleCancel}
                              disabled={isActionLoading}
                              className="p-1.5 hover:bg-red-500/10 text-destructive rounded-md transition-colors disabled:opacity-50"
                              title="Cancel"
                            >
                              {isActionLoading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Square className="h-3 w-3 fill-current" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Row 2: Progress Bar & Percentage */}
                      <div className="flex items-center gap-3">
                        <Progress
                          value={processProgress}
                          className="h-2.5 flex-1"
                        />
                        <span className="text-xs font-mono font-bold w-[3rem] text-right">
                          {processProgress}%
                        </span>
                      </div>

                      {/* Row 3: Stats (Processed & Time) */}
                      <div className="flex justify-between items-center text-[11px] font-mono font-medium text-muted-foreground/80">
                        <span>{metrics.processed.toLocaleString()} rows</span>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md min-w-[70px]">
                            <Clock className="h-3 w-3" />
                            <span className="font-mono font-bold">
                              {status === "Paused"
                                ? "PAUSED"
                                : status === "Cancelled"
                                ? "CANCELLED"
                                : formatTime(metrics.elapsed)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-primary text-primary-foreground px-2 py-1 rounded-md min-w-[100px]">
                            <span className="opacity-70 text-[8px] uppercase font-black">
                              ETA
                            </span>
                            <span className="font-mono font-bold leading-none">
                              {status === "Completed"
                                ? "FINISHED"
                                : status === "Indexing"
                                ? "--"
                                : status === "Paused"
                                ? "--"
                                : metrics.eta > 0
                                ? formatTime(metrics.eta)
                                : "--"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Step 3: Indexing (only show when processing complete) */}
                      {(status === "Indexing" || processProgress === 100) && (
                        <div className="mt-4 pt-4 border-t border-primary/10 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="flex justify-between items-center h-8">
                            <span className="flex items-center gap-2 text-xs font-bold">
                              {status === "Indexing" ? (
                                <>
                                  <Zap className="h-4 w-4 text-amber-500 animate-bounce" />
                                  <span className="text-amber-500">
                                    3. Database Index Optimization
                                  </span>
                                </>
                              ) : status === "Completed" ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  <span className="text-green-500">
                                    3. Index Optimization Complete
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                                  <span className="text-muted-foreground">
                                    3. Waiting for Data...
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                          <Progress
                            value={
                              status === "Completed"
                                ? 100
                                : status === "Indexing"
                                ? 50
                                : 0
                            }
                            className="h-2"
                          />
                          <p className="text-[10px] text-muted-foreground">
                            {status === "Indexing"
                              ? "Building search indexes for fast queries..."
                              : status === "Completed"
                              ? "All indexes ready. You can now search and filter data."
                              : "Will start after data processing completes."}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="p-5 rounded-full bg-background border-2 border-primary/5 shadow-xl transition-transform duration-500 group-hover:scale-110">
              <UploadCloud className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-all duration-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-lg text-foreground">
                Click to upload or drag & drop
              </p>
              <p className="text-sm text-muted-foreground">
                Support 2GB+ CSV/Excel Datasets
              </p>
            </div>
          </>
        )}
      </div>

      <div className="pt-2">
        <Button
          className="w-full font-black uppercase text-sm h-12 shadow-lg shadow-primary/20"
          onClick={handleUpload}
          disabled={!file || uploading}
          size="lg"
        >
          {uploading ? (
            phase === "hashing" ? (
              "Generating Digital Signatures..."
            ) : phase === "uploading" ? (
              "Streaming to Storage..."
            ) : status === "Indexing" ? (
              "Applying Search Indexes..."
            ) : (
              `Processing Record Pipeline...`
            )
          ) : (
            <>
              <FileSpreadsheet className="mr-3 h-5 w-5" /> Initialize Data
              Pipeline
            </>
          )}
        </Button>
      </div>

      {error && (
        <Alert
          variant="destructive"
          className="border-2 animate-in slide-in-from-top-4"
        >
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="font-bold text-sm">
            System Halt / Pipeline Error
          </AlertTitle>
          <AlertDescription className="text-xs font-mono break-all">
            {error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

const MetricItem = ({
  label,
  value,
  color = "text-foreground",
  unit = "",
  hasZap = false,
}: any) => (
  <div className="space-y-1.5">
    <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-black opacity-60">
      {label}
    </p>
    <p
      className={clsx(
        "text-lg font-mono font-black tracking-tighter flex items-center gap-1",
        color
      )}
    >
      {hasZap && <Zap className="h-3 w-3 text-primary" />}
      {value}
      {unit && (
        <span className="text-[10px] uppercase font-normal text-muted-foreground ml-0.5">
          {unit}
        </span>
      )}
    </p>
  </div>
);

export default UploadZone;
