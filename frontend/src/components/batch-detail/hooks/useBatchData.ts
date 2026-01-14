import { useState, useEffect, useCallback } from 'react';
import { toast } from "sonner";
import { api } from "../../../lib/api";
import { useBatchActions } from "../../../hooks/useBatchActions";
import type { Batch } from '../types';

export function useBatchData(id: string | undefined) {
    const [batch, setBatch] = useState<Batch | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchBatchData = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const data = await api.get<Batch>(`/batches/${id}`);
            setBatch(data);
        } catch (err: any) {
            console.error(err);
            setError(err);
            // Optional: toast.error("Failed to load batch data");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchBatchData();
    }, [fetchBatchData]);

    const {
        handlePause,
        handleResume,
        handleCancel,
        isActionLoading
    } = useBatchActions(id, fetchBatchData);

    const handleDownload = (type?: 'clean' | 'error') => {
        if (!id || !batch) return;
        const url = type ? `/batches/${id}/export?type=${type}` : `/batches/${id}/export`;
        api.download(url).catch(() => toast.error("Download failed"));
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
        loading,
        error,
        handleDownload,
        handleSaveBatchName,
        handlePause,
        handleResume,
        handleCancel,
        isActionLoading,
        refreshBatch: fetchBatchData
    };
}
