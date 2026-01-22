import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Database,
  Sparkles,
  Rocket,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import UploadDropZone from "../components/upload/UploadDropZone";
import RuleConfigPanel from "../components/upload/RuleConfigPanel";
import ProcessingStatus from "../components/upload/ProcessingStatus";
import { useCleaningRules } from "../hooks/useCleaningRules";
import { api, API_BASE_URL } from "../lib/api";
import { sha256 } from "js-sha256";
import { toast } from "sonner";

export default function ImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<
    "idle" | "uploading" | "processing" | "completed" | "error"
  >("idle");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(true);

  const [metrics, setMetrics] = useState({
    total: 0,
    success: 0,
    failed: 0,
    processed: 0,
    elapsed: 0,
    eta: 0,
    speed: 0,
  });
  const [processProgress, setProcessProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { rules, addRule, removeRule, updateRule, setRules } =
    useCleaningRules();

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setPhase("idle");

    // Auto-detect columns for CSV files
    if (selectedFile.name.endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const firstLine = text.split("\n")[0];
        if (!firstLine || firstLine.length < 2) return;

        // Simple CSV header detection
        const cols = firstLine
          .split(",")
          .map((c) => c.trim().replace(/^"|"$/g, ""))
          .filter((c) => c.length > 0);

        if (cols.length === 0) return;

        try {
          // Fetch suggested rules from backend
          const suggestedRules = await api.post<any[]>(
            "/upload/suggest-rules",
            {
              headers: cols,
            },
          );
          setRules(suggestedRules);
        } catch (err) {
          console.error("Failed to fetch suggested rules:", err);
          // Fallback to just headers with no rules
          setRules(cols.map((col) => ({ column: col, rules: [] })));
        }
      };
      reader.readAsText(selectedFile.slice(0, 4096));
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setPhase("uploading");

      // 采样哈希策略（头2MB + 中间2MB + 尾2MB + 文件大小）
      const SAMPLE_SIZE = 2 * 1024 * 1024; // 2MB
      const fileSize = file.size;

      let hashInput: ArrayBuffer;
      if (fileSize <= SAMPLE_SIZE * 3) {
        hashInput = await file.arrayBuffer();
      } else {
        const head = await file.slice(0, SAMPLE_SIZE).arrayBuffer();
        const midStart = Math.floor(fileSize / 2) - Math.floor(SAMPLE_SIZE / 2);
        const middle = await file
          .slice(midStart, midStart + SAMPLE_SIZE)
          .arrayBuffer();
        const tail = await file
          .slice(fileSize - SAMPLE_SIZE, fileSize)
          .arrayBuffer();

        const combined = new Uint8Array(SAMPLE_SIZE * 3 + 8);
        combined.set(new Uint8Array(head), 0);
        combined.set(new Uint8Array(middle), SAMPLE_SIZE);
        combined.set(new Uint8Array(tail), SAMPLE_SIZE * 2);
        const sizeView = new DataView(combined.buffer, SAMPLE_SIZE * 3, 8);
        sizeView.setBigUint64(0, BigInt(fileSize), true);
        hashInput = combined.buffer;
      }
      const fileHash = sha256(hashInput);

      let physicalExists = false;
      try {
        const checkRes = await api.post<{ exists: boolean }>("/upload/check", {
          hash: fileHash,
        });
        physicalExists = !!checkRes.exists;
      } catch (e) {
        console.warn("Hash check failed", e);
      }

      let res: { batch_id: string };

      if (physicalExists) {
        // 秒传模式：只发送元数据
        const formData = new FormData();
        formData.append("hash", fileHash);
        formData.append("filename", file.name);
        formData.append("rules", JSON.stringify(rules));
        res = await api.post<{ batch_id: string }>("/upload", formData);
      } else {
        // 正常上传：使用 api.upload 支持进度
        res = await api.upload<{ batch_id: string }>(
          "/upload",
          file,
          (percent) => setUploadProgress(percent),
          { hash: fileHash, rules: JSON.stringify(rules) },
        );
      }
      setBatchId(res.batch_id);
      setPhase("processing");
      toast.success(physicalExists ? "文件秒传成功 (Instant)" : "上传完成。");
    } catch (err: any) {
      setPhase("error");
      toast.error("上传失败: " + err.message);
    }
  };

  useEffect(() => {
    if (phase !== "processing" || !batchId) return;

    let eventSource: EventSource | null = null;
    const connectStream = () => {
      const token = localStorage.getItem("auth_token");
      const baseUrl = API_BASE_URL.startsWith("http")
        ? API_BASE_URL
        : `${window.location.origin}${API_BASE_URL}`;

      const url = `${baseUrl}/batches/${batchId}/progress?token=${token}`;
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "progress") {
            setMetrics({
              total: data.total,
              success: data.success,
              failed: data.failed,
              processed: data.processed,
              elapsed: data.elapsed,
              eta: data.eta,
              speed: data.speed,
            });
            setProcessProgress(data.percent);

            // 处理各种完成状态
            if (data.status === "Completed" || data.percent >= 100) {
              setPhase("completed");
              eventSource?.close();
            } else if (data.status === "Indexing") {
              // 索引阶段：保持 processing 状态但更新进度显示
              setProcessProgress(99); // 显示接近完成
            }
          } else if (data.type === "completed") {
            setMetrics((prev) => ({
              ...prev,
              total: data.total,
              success: data.success,
              failed: data.failed,
              processed: data.total,
            }));
            setProcessProgress(100);
            setPhase("completed");
            eventSource?.close();
            toast.success("数据处理完成！");
          } else if (data.type === "error") {
            setPhase("error");
            toast.error("处理出错: " + data.message);
            eventSource?.close();
          }
        } catch (err) {
          console.error("Parse SSE error", err);
        }
      };

      eventSource.onerror = (err) => {
        console.error("SSE connection error", err);
        eventSource?.close();
        if (phase === "processing") {
          setTimeout(connectStream, 3000);
        }
      };
    };

    connectStream();

    return () => {
      eventSource?.close();
    };
  }, [phase, batchId]);

  const handleAction = async (action: "pause" | "resume" | "cancel") => {
    if (!batchId) return;
    try {
      if (action === "pause") await api.post(`/batches/${batchId}/pause`, {});
      else if (action === "resume")
        await api.post(`/batches/${batchId}/resume`, {});
      else if (action === "cancel")
        await api.post(`/batches/${batchId}/cancel`, {});
    } catch (err: any) {
      toast.error(`提交 ${action} 命令失败: ${err.message}`);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background flex flex-col">
      <div className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-30">
        <div className="container max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="rounded-full hover:bg-primary/10 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                <Database className="h-5 w-5" />
              </div>
              <Separator
                orientation="vertical"
                className="h-8 mx-2 hidden sm:block"
              />
              <div className="max-w-[150px] sm:max-w-[300px]">
                <h1 className="text-sm font-black uppercase tracking-widest text-foreground leading-none mb-1 truncate">
                  {file ? file.name : "正在等待文件..."}
                </h1>
                <p className="text-[10px] text-muted-foreground uppercase font-bold opacity-60 leading-none truncate">
                  导入流水线
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {phase === "idle" && file && (
              <Button onClick={handleUpload} className="px-6">
                <Rocket className="h-4 w-4 mr-2" />
                <span>启动处理</span>
              </Button>
            )}
            {phase === "completed" && (
              <Button
                onClick={() => navigate(`/batches/${batchId}`)}
                className="px-6"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                <span>查看结果</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 container max-w-screen-2xl mx-auto p-6 lg:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 h-full">
          <div className="lg:col-span-4 flex flex-col gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-[0.3em] mb-2">
                <Sparkles className="h-3 w-3" /> 步骤 01
              </div>
              <h2 className="text-3xl font-black text-foreground uppercase tracking-tight">
                数据源
              </h2>
              <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                上传您的 CSV 或 Excel
                文件。每一行记录都将根据您配置的规则进行实时校验。
              </p>
            </div>

            <AnimatePresence mode="wait">
              {phase === "idle" ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <UploadDropZone file={file} onFileSelect={handleFileSelect} />
                </motion.div>
              ) : phase === "uploading" ? (
                <motion.div
                  key="uploading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-8 rounded-[32px] border-2 border-dashed border-primary/30 bg-primary/5"
                >
                  <div className="text-center space-y-4">
                    <div className="h-12 w-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                      <Rocket className="h-6 w-6 text-primary animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-foreground">
                        正在上传文件...
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file?.name}
                      </p>
                    </div>
                    <div className="w-full max-w-xs mx-auto space-y-2">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs font-mono text-primary">
                        {uploadProgress}%
                      </p>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="status"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <Card className="bg-card/50 backdrop-blur-xl border-primary/10 rounded-[32px] shadow-xl overflow-hidden">
                    <CardContent className="p-8">
                      <ProcessingStatus
                        status={
                          phase === "processing"
                            ? "处理中"
                            : phase === "completed"
                              ? "已完成"
                              : "错误"
                        }
                        phase={phase}
                        metrics={metrics}
                        processProgress={processProgress}
                        isActionLoading={false}
                        onPause={() => handleAction("pause")}
                        onCancel={() => handleAction("cancel")}
                        onReset={() => {
                          setFile(null);
                          setPhase("idle");
                          setBatchId(null);
                          setMetrics({
                            total: 0,
                            success: 0,
                            failed: 0,
                            processed: 0,
                            elapsed: 0,
                            eta: 0,
                            speed: 0,
                          });
                          setProcessProgress(0);
                        }}
                        formatTime={(s) => `${s}秒`}
                      />
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-auto bg-primary/5 rounded-2xl p-6 border border-primary/10 hidden lg:block">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                SaaS 优化提示
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed italic">
                "应用严格的校验规则，确保数据入库的最高质量。"
              </p>
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="flex items-center justify-between mb-2 px-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-[0.3em]">
                  <Sparkles className="h-3 w-3" /> 步骤 02
                </div>
                <h3 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">
                  清洗逻辑配置
                </h3>
              </div>
            </div>

            <div className="flex-1 min-h-[500px]">
              <RuleConfigPanel
                rules={rules}
                showRules={showRules}
                onToggleRules={() => setShowRules(!showRules)}
                onAddRule={addRule}
                onRemoveRule={removeRule}
                onUpdateRule={updateRule}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
