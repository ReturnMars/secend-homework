import { useState, useEffect, useCallback } from 'react';
import { toast } from "sonner";
import type { Batch } from '../types';

export function useBatchData(id: string | undefined) {
    const [batch, setBatch] = useState<Batch | null>(null);

    const fetchBatchData = useCallback(async () => {
        if (!id) return;
        try {
            const res = await fetch(`http://localhost:8080/api/batches/${id}`);
            const data = await res.json();
            setBatch(data);
        } catch (err) {
            console.error(err);
        }
    }, [id]);

    useEffect(() => {
        fetchBatchData();
    }, [fetchBatchData]);

    const handleDownload = () => {
        if (!id) return;
        window.location.href = `http://localhost:8080/api/batches/${id}/export`;
    };

    const handleSaveBatchName = async (name: string) => {
        if (!id || !batch) return;
        try {
            const res = await fetch(`http://localhost:8080/api/batches/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                setBatch(prev => prev ? { ...prev, original_filename: name } : null);
                toast.success("Batch renamed successfully");
                return true;
            } else {
                toast.error("Failed to rename batch");
                return false;
            }
        } catch (err) {
            console.error(err);
            toast.error("Network error");
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
