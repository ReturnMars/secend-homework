import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Download,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  Pause,
  Play,
  Square,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ButtonGroup } from "@/components/ui/button-group";
import type { Batch } from "./types";

interface BatchHeaderProps {
  batch: Batch;
  handleDownload: (type?: "clean" | "error") => void;
  handleSaveBatchName: (name: string) => Promise<boolean | undefined>;
  handlePause: () => void;
  handleResume: () => void;
  handleCancel: () => void;
  isActionLoading?: boolean;
}

export function BatchHeader({
  batch,
  handleDownload,
  handleSaveBatchName,
  handlePause,
  handleResume,
  handleCancel,
  isActionLoading = false,
}: BatchHeaderProps) {
  const navigate = useNavigate();
  const [isEditingBatchName, setIsEditingBatchName] = useState(false);
  const [tempBatchName, setTempBatchName] = useState("");
  const [extension, setExtension] = useState("");

  const handleStartEditBatchName = () => {
    const lastDotIndex = batch.original_filename.lastIndexOf(".");
    if (lastDotIndex > 0) {
      setTempBatchName(batch.original_filename.substring(0, lastDotIndex));
      setExtension(batch.original_filename.substring(lastDotIndex));
    } else {
      setTempBatchName(batch.original_filename);
      setExtension("");
    }
    setIsEditingBatchName(true);
  };

  const onSave = async () => {
    const finalName = tempBatchName.trim() + extension;
    if (!tempBatchName.trim()) {
      toast.error("文件名不能为空");
      setIsEditingBatchName(false);
      return;
    }

    if (finalName === batch.original_filename) {
      setIsEditingBatchName(false);
      return;
    }

    const success = await handleSaveBatchName(finalName);
    if (success) {
      setIsEditingBatchName(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="space-y-1">
          <div className="flex items-center gap-1 group h-9">
            {isEditingBatchName ? (
              <div className="flex items-center border-b-2 border-primary/50 focus-within:border-primary transition-colors pb-0.5 h-full">
                <div className="inline-grid items-center">
                  <span
                    className="invisible whitespace-pre text-2xl font-bold tracking-tight leading-8 row-start-1 col-start-1 px-px"
                    aria-hidden="true"
                  >
                    {tempBatchName || " "}
                  </span>
                  <input
                    value={tempBatchName}
                    onChange={(e) => setTempBatchName(e.target.value)}
                    className="text-2xl font-bold tracking-tight leading-8 bg-transparent outline-none row-start-1 col-start-1 w-full min-w-0 p-0 m-0"
                    onKeyDown={(e) => e.key === "Enter" && onSave()}
                    onBlur={onSave}
                    autoFocus
                    size={1}
                  />
                </div>
                <span className="text-2xl font-bold tracking-tight leading-8 text-muted-foreground/40 pointer-events-none select-none shrink-0">
                  {extension}
                </span>
              </div>
            ) : (
              <div className="flex items-center border-b-2 border-transparent pb-0.5 h-full">
                <h1 className="text-2xl font-bold tracking-tight leading-8">
                  {batch.original_filename}
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary ml-1"
                  onClick={handleStartEditBatchName}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">
              {batch.status === "Processing"
                ? "运行中"
                : batch.status === "Completed"
                  ? "已完成"
                  : batch.status === "Failed"
                    ? "已失败"
                    : batch.status === "Paused"
                      ? "已暂停"
                      : "等待中"}
            </Badge>
            <span>创建于 {new Date(batch.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Task Controls */}
        {(batch.status === "Processing" || batch.status === "Pending") && (
          <Button
            variant="outline"
            size="sm"
            onClick={handlePause}
            disabled={isActionLoading}
            className="h-9 gap-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
            暂停
          </Button>
        )}

        {batch.status === "Paused" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResume}
            disabled={isActionLoading}
            className="h-9 gap-2 text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            恢复
          </Button>
        )}

        {(batch.status === "Processing" ||
          batch.status === "Pending" ||
          batch.status === "Paused") && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isActionLoading}
            className="h-9 gap-2 text-destructive hover:bg-red-50"
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4 fill-current" />
            )}
            停止
          </Button>
        )}

        {/* Modern Split Button Export */}
        <ButtonGroup>
          <Button
            variant="default"
            onClick={() => handleDownload()}
            className="h-9 px-4"
          >
            <Download className="mr-2 h-4 w-4" /> 导出全部
          </Button>

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="icon"
                className="h-9 w-9"
                aria-label="Export options"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => handleDownload("clean")}
                className="cursor-pointer py-2.5"
              >
                <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">仅导出清洗后数据</span>
                  <span className="text-[10px] text-muted-foreground leading-none">
                    仅下载校验成功的记录
                  </span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleDownload("error")}
                className="cursor-pointer py-2.5 text-destructive focus:text-destructive"
              >
                <AlertCircle className="mr-2 h-4 w-4 text-red-500" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">下载错误报告</span>
                  <span className="text-[10px] text-muted-foreground leading-none">
                    仅下载校验失败的记录
                  </span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>
    </div>
  );
}
