import React, { useState, useEffect, useRef } from "react";
import {
    CheckCircle2,
    Layers,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import clsx from "clsx";
import { Button } from "./ui/button";
import { api } from "../lib/api";

interface TaskItemProps {
    batchId: string;
    fileName: string;
    onFinished?: () => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ batchId, fileName, onFinished }) => {
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<string>("Processing");
    const [metrics, setMetrics] = useState({
        processed: 0,
        total: 0,
        speed: 0,
        eta: 0
    });

    const startTimeRef = useRef<number>(Date.now());

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

                    const now = Date.now();
                    const elapsedSec = (now - startTimeRef.current) / 1000;
                    let speed = 0;
                    let eta = 0;

                    if (elapsedSec > 2 && processed > 100) {
                        speed = Math.round(processed / elapsedSec);
                        eta = Math.ceil((total - processed) / speed);
                    }

                    setProgress(percent);
                    setMetrics({ processed, total, speed, eta });
                }

                if (data.status === "Completed") {
                    evtSource.close();
                    if (onFinished) onFinished();
                } else if (data.status === "Failed") {
                    evtSource.close();
                }
            } catch (e) {
                console.error("TaskItem SSE Error", e);
            }
        };

        return () => evtSource.close();
    }, [batchId]);

    return (
        <div className="py-3 border-b border-border/40 last:border-0 group">
            <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={clsx(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        status === "Completed" ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-primary animate-pulse"
                    )} />
                    <span className="text-[11px] font-bold truncate opacity-80" title={fileName}>{fileName}</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-primary">
                    {status === "Completed" ? "DONE" : `${progress}%`}
                </span>
            </div>

            <Progress value={progress} className="h-1 mb-2 bg-secondary/40" />

            <div className="flex justify-between items-center px-0.5">
                <div className="flex gap-3 text-[9px] font-mono opacity-60">
                    <span>{status === "Completed" ? "CACHED" : `${(metrics.speed / 1000).toFixed(1)}k r/s`}</span>
                    {status !== "Completed" && <span>ETA: {metrics.eta}s</span>}
                </div>
                {status === "Completed" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            </div>
        </div>
    );
};

interface TaskManagerProps {
    tasks: { id: string; name: string }[];
    onCloseTask: (id: string) => void;
}

const TaskManager: React.FC<TaskManagerProps> = ({ tasks, onCloseTask }) => {
    const [isMinimized, setIsMinimized] = useState(false);

    if (tasks.length === 0) return null;

    return (
        <Card className={clsx(
            "fixed bottom-6 py-0! right-6 z-[100] transition-all duration-500 ease-in-out shadow-2xl border-primary/20",
            "bg-background/80 backdrop-blur-xl overflow-hidden flex flex-col gap-0! w-68",
            "animate-in slide-in-from-right-8 fade-in duration-500",
            isMinimized ? "h-12" : "max-h-[480px]"
        )}>
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-border/50 shrink-0 bg-primary/5">
                <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="text-[11px] font-black uppercase tracking-widest">
                        Task Center <span className="ml-1 opacity-50">({tasks.length})</span>
                    </span>
                </div>
                <div className="flex items-center ">
                    <Button
                        variant="secondary"
                        onClick={() => setIsMinimized(!isMinimized)}
                        className=" p-1.5 hover:bg-muted rounded-md transition-colors cursor-pointer"
                    >
                        {isMinimized ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                </div>
            </div>

            {/* Content */}
            {!isMinimized && (
                <div className="px-4 overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-2 fade-in duration-300">
                    {tasks.map(t => (
                        <TaskItem key={t.id} batchId={t.id} fileName={t.name} />
                    ))}
                    <div className="pt-2 text-center pb-3">
                        <button
                            onClick={() => tasks.forEach(t => onCloseTask(t.id))}
                            className="text-[9px] font-bold uppercase tracking-tighter text-muted-foreground hover:text-red-500 transition-colors"
                        >
                            Clear All Tasks
                        </button>
                    </div>
                </div>
            )}

            {/* Mini Progress when Minimized */}
            {isMinimized && (
                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-secondary/20">
                    <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
                </div>
            )}
        </Card>
    );
};

export default TaskManager;
