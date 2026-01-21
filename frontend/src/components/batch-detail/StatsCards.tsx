import { CheckCircle, AlertCircle, Filter } from "lucide-react";
import type { Batch } from "./types";

interface StatsCardsProps {
  batch: Batch;
}

export function StatsCards({ batch }: StatsCardsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 py-2">
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-50/50 text-blue-700 rounded-lg border border-blue-100 shadow-sm">
        <Filter className="h-4 w-4" />
        <span className="font-medium">
          总数据量: {batch.total_rows.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 bg-green-50/50 text-green-700 rounded-lg border border-green-100 shadow-sm">
        <CheckCircle className="h-4 w-4" />
        <span className="font-medium">
          校验成功: {batch.success_count.toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50/50 text-red-700 rounded-lg border border-red-100 shadow-sm">
        <AlertCircle className="h-4 w-4" />
        <span className="font-medium">
          校验失败: {batch.failure_count.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
