import React, { useState, useCallback, useRef } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  File as FileIcon,
  X,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { api } from "../lib/api";

export interface ProcessStats {
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  result_id: string;
  preview_data: Array<any>;
}

interface UploadZoneProps {
  onSuccess: (stats: ProcessStats) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

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
    // Extension check as fallback
    const isCsvOrExcel =
      validTypes.includes(file.type) ||
      file.name.endsWith(".csv") ||
      file.name.endsWith(".xlsx");

    if (isCsvOrExcel) {
      setFile(file);
      setError(null);
      setProgress(0); // Reset progress on new file
    } else {
      setError("Please upload a valid CSV or Excel file.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // 1. Start Upload
      // api wrapper handles FormData and Auth header automatically
      const res = await api.post<{ batch_id: string }>("/upload", formData);
      const { batch_id } = res;

      const token = localStorage.getItem("auth_token");

      // 2. Connect to SSE Stream
      // EventSource doesn't support headers, so we pass token in query
      const evtSource = new EventSource(
        `http://localhost:8080/api/batches/${batch_id}/progress?token=${token}`
      );

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.total_rows > 0) {
            const percent = Math.round(
              (data.processed_rows / data.total_rows) * 100
            );
            setProgress(percent);
          }

          if (data.status === "Completed") {
            evtSource.close();
            setProgress(100);
            setTimeout(() => {
              onSuccess({
                total_rows: data.total_rows,
                success_rows: data.filters.success,
                failed_rows: data.filters.failed,
                result_id: batch_id.toString(),
                preview_data: [],
              });
            }, 500);
          } else if (data.status === "Failed") {
            evtSource.close();
            setError(data.error || "Processing failed");
            setUploading(false);
          }
        } catch (e) {
          console.error("SSE Parse Error", e);
        }
      };

      evtSource.onerror = (err) => {
        console.error("SSE Error", err);
        evtSource.close();
        // Only set error if we haven't finished (sometimes connection closes abruptly)
        if (progress < 100) {
          setError("Connection lost during processing");
          setUploading(false);
        }
      };
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full space-y-6">
      <div
        onClick={triggerFileInput}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={clsx(
          "relative rounded-xl p-10 transition-all duration-200 ease-in-out flex flex-col items-center justify-center gap-4 cursor-pointer group",
          isDragging
            ? "bg-primary/5 ring-2 ring-primary ring-inset"
            : "bg-muted/30 hover:bg-muted/60",
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
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={clearFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {uploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Processing...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </div>
        ) : (
          <>
            <div
              className={clsx(
                "p-4 rounded-full bg-background border shadow-sm transition-transform duration-300 group-hover:scale-105"
              )}
            >
              <UploadCloud className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium text-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                CSV or Excel (MAX. 10MB)
              </p>
            </div>
          </>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="animate-in slide-in-from-top-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="pt-2">
        <Button
          className="w-full font-semibold"
          onClick={handleUpload}
          disabled={!file || uploading}
          size="lg"
        >
          {uploading ? (
            "Cleaning Data..."
          ) : (
            <>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Start Process
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default UploadZone;
