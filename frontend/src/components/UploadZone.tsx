import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  File as FileIcon,
  X,
  Loader2,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { api } from "../lib/api";
import { useBatchActions } from "../hooks/useBatchActions";
import { sha256 } from "js-sha256";

// Imported Refactored Parts
import { useCleaningRules } from "../hooks/useCleaningRules";
import RuleConfigPanel from "./upload/RuleConfigPanel";
import ProcessingStatus from "./upload/ProcessingStatus";
import UploadDropZone from "./upload/UploadDropZone";

interface ProcessStats {
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
  // 1. File & UI State
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [phase, setPhase] = useState<
    "idle" | "hashing" | "uploading" | "processing"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string>();
  const [status, setStatus] = useState<string>("Pending");

  // 2. Metrics State
  const [metrics, setMetrics] = useState({
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    speed: 0,
    elapsed: 0,
    eta: 0,
  });
  const [processProgress, setProcessProgress] = useState(0);

  // 3. Custom Hooks
  const { rules, showRules, toggleRules, addRule, removeRule, updateRule } =
    useCleaningRules();
  const { handlePause, handleCancel, isActionLoading } =
    useBatchActions(batchId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (sseRef.current) sseRef.current.close();
    };
  }, []);

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "0s";
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
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
      setPhase("idle");
    } else {
      setError("Please upload a valid CSV or Excel file.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      setError(null);

      // 1. Hash Calculation (采样哈希，避免大文件卡死浏览器)
      // 策略：文件头2MB + 中间2MB + 尾部2MB + 文件大小
      setPhase("hashing");
      const SAMPLE_SIZE = 2 * 1024 * 1024; // 2MB
      const fileSize = file.size;

      let hashInput: ArrayBuffer;
      if (fileSize <= SAMPLE_SIZE * 3) {
        // 小文件：直接全文件哈希
        hashInput = await file.arrayBuffer();
      } else {
        // 大文件：采样哈希
        const head = await file.slice(0, SAMPLE_SIZE).arrayBuffer();
        const midStart = Math.floor(fileSize / 2) - Math.floor(SAMPLE_SIZE / 2);
        const middle = await file
          .slice(midStart, midStart + SAMPLE_SIZE)
          .arrayBuffer();
        const tail = await file
          .slice(fileSize - SAMPLE_SIZE, fileSize)
          .arrayBuffer();

        // 合并采样 + 文件大小作为盐值
        const combined = new Uint8Array(SAMPLE_SIZE * 3 + 8);
        combined.set(new Uint8Array(head), 0);
        combined.set(new Uint8Array(middle), SAMPLE_SIZE);
        combined.set(new Uint8Array(tail), SAMPLE_SIZE * 2);
        // 将文件大小编码为8字节（BigInt方式）
        const sizeView = new DataView(combined.buffer, SAMPLE_SIZE * 3, 8);
        sizeView.setBigUint64(0, BigInt(fileSize), true);
        hashInput = combined.buffer;
      }
      const fileHash = sha256(hashInput);

      // 2. Check duplicate first (Physical file exists?)
      let physicalExists = false;
      try {
        const checkRes = await api.post<{ exists: boolean }>("/upload/check", {
          hash: fileHash,
        });
        physicalExists = !!checkRes.exists;
      } catch (e) {
        console.warn(
          "Duplicate check failed, proceeding with standard upload",
          e,
        );
      }

      // 3. Create Batch and Upload
      setPhase("uploading");

      const formData = new FormData();
      formData.append("hash", fileHash);
      formData.append("rules", JSON.stringify(rules));

      // 如果物理文件已存在，我们不发送 file 字节流，只发送 metadata 触发后端“秒传式新建”
      if (!physicalExists) {
        formData.append("file", file);
      }

      // 3. Multi-part Upload
      setPhase("uploading");
      const res = await api.upload<{ batch_id: string }>(
        "/upload",
        file,
        (p) => setUploadProgress(p),
        {
          hash: fileHash,
          rules: JSON.stringify(rules),
        },
      );

      setBatchId(res.batch_id);
      setPhase("processing");
      startSSE(res.batch_id);
    } catch (err: any) {
      setError(err.message || "Upload failed");
      setUploading(false);
      setPhase("idle");
    }
  };

  const startSSE = (batch_id: string) => {
    if (sseRef.current) sseRef.current.close();

    const evtSource = api.getProgressSource(batch_id);
    sseRef.current = evtSource;

    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        setMetrics({
          total: data.total,
          processed: data.processed,
          success: data.success,
          failed: data.failed,
          speed: data.speed,
          elapsed: data.elapsed,
          eta: data.eta,
        });
        setProcessProgress(data.percent);
        setStatus(data.status);
      } else if (data.type === "completed") {
        evtSource.close();
        onSuccess(
          {
            total_rows: data.total,
            success_rows: data.success,
            failed_rows: data.failed,
            result_id: batch_id,
            preview_data: data.preview || [],
          },
          file?.name,
        );
      } else if (data.type === "error") {
        evtSource.close();
        setError(data.message);
        setUploading(false);
      }
    };

    evtSource.onerror = (err) => {
      console.error("SSE Error:", err);
      setError(
        "Lost connection to process stream. We are trying to reconnect...",
      );
    };
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setUploadProgress(0);
    setProcessProgress(0);
    setBatchId(undefined);
    setPhase("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div
        className={clsx(
          "group relative border-2 border-dashed rounded-3xl p-8 transition-all duration-500",
          "hover:border-primary/50 hover:bg-primary/2 hover:shadow-2xl hover:shadow-primary/5",
          file
            ? "border-primary/30 bg-primary/1"
            : "border-muted-foreground/20",
          uploading && "pointer-events-none opacity-80",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
          }
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
          accept=".csv, .xlsx"
          disabled={uploading}
        />

        {file ? (
          <div className="w-full space-y-4 animate-in fade-in zoom-in duration-300">
            {/* File Info Card */}
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
                {/* Upload Phase Progress */}
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

                {/* Processing Phase Status */}
                {phase === "processing" && (
                  <ProcessingStatus
                    status={status}
                    phase={phase === "processing" ? "processing" : "idle"}
                    metrics={{
                      ...metrics,
                      total: metrics.total,
                      processed: metrics.processed,
                      success: metrics.success,
                      failed: metrics.failed,
                      speed: metrics.speed,
                      elapsed: metrics.elapsed,
                      eta: metrics.eta,
                    }}
                    processProgress={processProgress}
                    isActionLoading={isActionLoading}
                    onPause={handlePause}
                    onCancel={handleCancel}
                    formatTime={formatTime}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <UploadDropZone
            file={file}
            onFileSelect={(f) => validateAndSetFile(f)}
          />
        )}
      </div>

      {/* Rule Configuration Panel */}
      {file && !uploading && (
        <RuleConfigPanel
          rules={rules}
          showRules={showRules}
          onToggleRules={toggleRules}
          onAddRule={addRule}
          onRemoveRule={removeRule}
          onUpdateRule={updateRule}
        />
      )}

      {/* Start Button */}
      {!uploading && (
        <div className="pt-2">
          <Button
            className="w-full font-black uppercase text-sm h-12 shadow-lg shadow-primary/20"
            onClick={handleUpload}
            disabled={!file}
            size="lg"
          >
            <FileSpreadsheet className="mr-3 h-5 w-5" /> Initialize Data
            Pipeline
          </Button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert
          variant="destructive"
          className="border-2 animate-in slide-in-from-top-4"
        >
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="font-bold text-sm text-destructive">
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

export default UploadZone;
