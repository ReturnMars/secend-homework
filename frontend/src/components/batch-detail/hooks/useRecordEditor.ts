import { useState, useCallback } from 'react';
import { toast } from "sonner";
import type { UseFormReturn } from "react-hook-form";
import type { Record, RecordVersion } from '../types';
import { api } from "../../../lib/api";

export function useRecordEditor(
    form: UseFormReturn<any>,
    refreshRecords: () => void,
    refreshBatch: () => void
) {
    const [editingRecord, setEditingRecord] = useState<Record | null>(null);
    const [history, setHistory] = useState<RecordVersion[]>([]);
    const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
    const [tempReason, setTempReason] = useState("");
    const [rollbackVersionId, setRollbackVersionId] = useState<number | null>(null);

    const fetchHistory = useCallback(async (recordId: number) => {
        try {
            const data = await api.get<RecordVersion[]>(`/records/${recordId}/history`);
            setHistory(data || []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    const handleEditClick = (record: Record) => {
        setEditingRecord(record);
        form.reset({
            name: record.name,
            phone: record.phone,
            date: record.date,
            province: record.province,
            city: record.city,
            district: record.district,
            reason: "",
        });
        setHistory([]);
        fetchHistory(record.id);
    };

    const handleSaveEdit = async (values: any) => {
        if (!editingRecord) return;
        try {
            // Note: api.put returns the data directly
            const data = await api.put<{ error?: string }>(`/records/${editingRecord.id}`, {
                    updates: {
                        name: values.name,
                        phone: values.phone,
                        date: values.date,
                        province: values.province || "",
                        city: values.city || "",
                        district: values.district || "",
                    },
                    reason: values.reason
            });

            // If we are here, it means success (api client throws on error)
            // But check specifically if backend returned functional error inside 200/201 (though usually it throws)
            // Wait, standard CRUD usually returns updated object or success message. 
            // In case of success with 'NO_CHANGES_DETECTED', my api wrapper returns data.
            // Let's assume standard behavior. If error logic is non-standard (e.g. 200 OK with error field), we handle it.
            
            if (data?.error === "NO_CHANGES_DETECTED") {
                toast.info("No changes detected. Please modify a field or cancel.");
            } else {
                form.reset({ ...values, reason: "" });
                refreshRecords();
                refreshBatch();
                fetchHistory(editingRecord.id);
                toast.success("Correction saved successfully");
            }
        } catch (err: any) {
             console.error(err);
             toast.error(err.message || "Failed to update record");
        }
    };

    const handleRollback = async (versionId: number) => {
        if (!editingRecord) return;
        try {
            const data = await api.post<Record>(`/records/${editingRecord.id}/rollback/${versionId}`);
            
            form.reset({
                name: data.name,
                phone: data.phone,
                date: data.date,
                province: data.province,
                city: data.city,
                district: data.district,
                reason: "",
            });
            refreshRecords();
            fetchHistory(editingRecord.id);
            setRollbackVersionId(null);
            toast.success("Rollback successful");
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Rollback failed");
        }
    };

    const handleUpdateReason = async (versionId: number) => {
        try {
            await api.patch(`/versions/${versionId}/reason`, { reason: tempReason });
            setEditingVersionId(null);
            if (editingRecord) fetchHistory(editingRecord.id);
            toast.success("Reason updated");
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Failed to update reason");
        }
    };

    return {
        editingRecord,
        setEditingRecord,
        history,
        editingVersionId,
        setEditingVersionId,
        tempReason,
        setTempReason,
        rollbackVersionId,
        setRollbackVersionId,
        handleEditClick,
        handleSaveEdit,
        handleRollback,
        handleUpdateReason,
    };
}
