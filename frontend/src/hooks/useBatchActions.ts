import { useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";

export function useBatchActions(batchId: string | undefined, onActionSuccess?: () => Promise<void> | void) {
  const [isActionLoading, setIsActionLoading] = useState(false);

  const handlePause = async () => {
    if (!batchId || isActionLoading) return;
    try {
      setIsActionLoading(true);
      await api.pauseBatch(batchId);
      toast.success("Batch processing paused");
      if (onActionSuccess) await onActionSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to pause batch");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResume = async () => {
    if (!batchId || isActionLoading) return;
    try {
      setIsActionLoading(true);
      await api.resumeBatch(batchId);
      toast.success("Batch processing resumed");
      if (onActionSuccess) await onActionSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to resume batch");
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!batchId || isActionLoading) return;
    try {
      setIsActionLoading(true);
      await api.cancelBatch(batchId);
      toast.success("Batch processing cancelled");
      if (onActionSuccess) await onActionSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel batch");
    } finally {
      setIsActionLoading(false);
    }
  };

  return {
    handlePause,
    handleResume,
    handleCancel,
    isActionLoading,
  };
}
