import React from "react";
import { FileUp, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadDropZoneProps {
  file: File | null;
  onFileSelect: (file: File) => void;
}

const UploadDropZone: React.FC<UploadDropZoneProps> = ({
  file,
  onFileSelect,
}) => {
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) onFileSelect(droppedFile);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        "relative group cursor-pointer border-2 border-dashed rounded-[32px] p-12 transition-all duration-500 flex flex-col items-center justify-center text-center gap-6 overflow-hidden",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.02] shadow-2xl shadow-primary/10"
          : file
            ? "border-primary/40 bg-primary/2"
            : "border-primary/10 hover:border-primary/30 bg-muted/20",
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
        className="hidden"
        accept=".csv,.xlsx,.xls"
      />

      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div
          className={cn(
            "relative h-20 w-20 rounded-[24px] flex items-center justify-center transition-all duration-500",
            file
              ? "bg-primary text-primary-foreground rotate-0"
              : "bg-primary/10 text-primary rotate-3 group-hover:rotate-0",
          )}
        >
          {file ? (
            <CheckCircle2 className="h-10 w-10" />
          ) : (
            <FileUp className="h-10 w-10" />
          )}
        </div>
      </div>

      <div className="space-y-2 relative z-10">
        <h3 className="text-xl font-black uppercase tracking-widest text-foreground">
          {file ? "文件已载入" : "将数据拖拽至此"}
        </h3>
        <p className="text-sm text-muted-foreground font-medium max-w-[240px] leading-relaxed">
          {file
            ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`
            : "拖拽您的电子表格文件至此处，或者点击手动选择"}
        </p>
      </div>

      {!file && (
        <div className="flex gap-2 mt-2">
          {["CSV", "XLSX", "JSON"].map((ext) => (
            <span
              key={ext}
              className="px-3 py-1 pb-1.5 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-black tracking-widest text-primary/60"
            >
              {ext}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default UploadDropZone;
