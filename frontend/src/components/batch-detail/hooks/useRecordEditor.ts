import { useState, useCallback } from 'react';
import { toast } from "sonner";
import type { UseFormReturn } from "react-hook-form";
import type { Record, RecordVersion } from '../types';

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
            const res = await fetch(`http://localhost:8080/api/records/${recordId}/history`);
            const data = await res.json();
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
            const res = await fetch(`http://localhost:8080/api/records/${editingRecord.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    updates: {
                        name: values.name,
                        phone: values.phone,
                        date: values.date,
                        province: values.province || "",
                        city: values.city || "",
                        district: values.district || "",
                    },
                    reason: values.reason
                })
            });
            const data = await res.json();
            if (res.ok) {
                form.reset({ ...values, reason: "" });
                refreshRecords();
                refreshBatch();
                fetchHistory(editingRecord.id);
                toast.success("Correction saved successfully");
            } else if (data.error === "NO_CHANGES_DETECTED") {
                toast.info("No changes detected. Please modify a field or cancel.");
            } else {
                toast.error("Failed to update: " + (data.error || res.statusText));
            }
        } catch (err) {
            console.error(err);
            toast.error("Network error");
        }
    };

    const handleRollback = async (versionId: number) => {
        if (!editingRecord) return;
        try {
            const res = await fetch(`http://localhost:8080/api/records/${editingRecord.id}/rollback/${versionId}`, {
                method: 'POST'
            });
            const data = await res.json();
            if (res.ok) {
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
            } else {
                toast.error("Rollback failed: " + data.error);
            }
        } catch (err) {
            console.error(err);
            toast.error("Network error");
        }
    };

    const handleUpdateReason = async (versionId: number) => {
        try {
            const res = await fetch(`http://localhost:8080/api/versions/${versionId}/reason`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: tempReason })
            });
            if (res.ok) {
                setEditingVersionId(null);
                if (editingRecord) fetchHistory(editingRecord.id);
                toast.success("Reason updated");
            } else {
                toast.error("Failed to update reason");
            }
        } catch (err) {
            console.error(err);
            toast.error("Network error");
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
