import { useState, useEffect, useCallback } from 'react';
import { toast } from "sonner";
import { api } from "../../../lib/api";
import type { Batch } from '../types';

export function useBatchData(id: string | undefined) {
    const [batch, setBatch] = useState<Batch | null>(null);

    const fetchBatchData = useCallback(async () => {
        if (!id) return;
        try {
            const data = await api.get<Batch>(`/batches/${id}`);
            setBatch(data);
        } catch (err) {
            console.error(err);
            // Optional: toast.error("Failed to load batch data");
        }
    }, [id]);

    useEffect(() => {
        fetchBatchData();
    }, [fetchBatchData]);

    const handleDownload = () => {
        if (!id) return;
        api.download(`/batches/${id}/export`)
           .catch(() => toast.error("Download failed"));
    };

    const handleSaveBatchName = async (name: string) => {
        if (!id || !batch) return;
        try {
            await api.patch(`/batches/${id}`, { name });
            setBatch(prev => prev ? { ...prev, original_filename: name } : null);
            toast.success("Batch renamed successfully");
            return true;
        } catch (err) {
            console.error(err);
            toast.error("Failed to rename batch");
            return false;
        }
    };

    return {
        batch,
        setBatch,
        handleDownload,
        handleSaveBatchName,
        refreshBatch: fetchBatchData
    };
}
