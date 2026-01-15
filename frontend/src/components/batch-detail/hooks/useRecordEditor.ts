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
    const [validationResult, setValidationResult] = useState<{
        current_status: string;
        new_status: string;
        new_error: string;
        has_changes: boolean;
    } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    const handleSaveEdit = async (values: any, confirmed: boolean | any = false) => {
        // 如果 confirmed 是事件对象（由 form.handleSubmit 默认传入），则将其视为 false
        const isConfirmed = typeof confirmed === 'boolean' ? confirmed : false;
        if (!editingRecord) return;
        
        const payload = {
            updates: {
                name: values.name,
                phone: values.phone,
                date: values.date,
                province: values.province || "",
                city: values.city || "",
                district: values.district || "",
            },
            reason: values.reason
        };

        try {
            // 第一步：预验证
            if (!isConfirmed) {
                const result = await api.post<any>(`/records/${editingRecord.id}/validate`, {
                    updates: payload.updates
                });
                
                if (!result.has_changes) {
                    toast.info("No changes detected.");
                    return;
                }

                // 如果状态没变，或者用户已经确认过，直接执行
                // 但为了符合用户要求“前端告知用户”，我们总是展示结果
                setValidationResult(result);
                return; // 等待用户在 UI 上点击确认
            }

            // 第二步：正式提交
            setIsSubmitting(true);
            const data = await api.put<{ error?: string }>(`/records/${editingRecord.id}`, payload);
            
            if (data?.error === "NO_CHANGES_DETECTED") {
                toast.info("No changes detected.");
            } else {
                form.reset({ ...values, reason: "" });
                setValidationResult(null);
                setEditingRecord(null);
                refreshRecords();
                refreshBatch();
                toast.success("Correction saved successfully");
            }
        } catch (err: any) {
             console.error(err);
             toast.error(err.message || "Operation failed");
        } finally {
            setIsSubmitting(false);
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
        validationResult,
        setValidationResult,
        isSubmitting,
        handleEditClick,
        handleSaveEdit,
        handleRollback,
        handleUpdateReason,
    };
}
