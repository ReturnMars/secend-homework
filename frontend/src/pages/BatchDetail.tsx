import { useParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "../components/ui/button";

// Internal Components
import { BatchHeader } from "../components/batch-detail/BatchHeader";
import { StatsCards } from "../components/batch-detail/StatsCards";
import { RecordTable } from "../components/batch-detail/RecordTable";
import { EditRecordSheet } from "../components/batch-detail/EditRecordSheet";

// Hooks
import { useBatchData } from "../components/batch-detail/hooks/useBatchData";
import { useRecords } from "../components/batch-detail/hooks/useRecords";
import { useRecordEditor } from "../components/batch-detail/hooks/useRecordEditor";

const formSchema = z.object({
  name: z
    .string()
    .min(1, "请输入姓名")
    .transform((v) => v.trim()),
  phone: z
    .string()
    .min(1, "请输入手机号")
    .transform((v) => v.trim()),
  date: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  reason: z.string().min(2, "修改原因至少需要2个字符"),
});

type FormValues = z.infer<typeof formSchema>;

export default function BatchDetail() {
  const { id } = useParams<{ id: string }>();

  // Init Logic Hooks
  const {
    batch,
    handleDownload,
    handleSaveBatchName,
    handlePause,
    handleResume,
    handleCancel,
    refreshBatch,
    loading: batchLoading,
    error: batchError,
  } = useBatchData(id);

  const {
    records,
    loading,
    total,
    page,
    setPage,
    pageSize,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    handleSearch,
    handleClearSearch,
    refreshRecords,
  } = useRecords(id);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      phone: "",
      date: "",
      province: "",
      city: "",
      district: "",
      reason: "",
    },
  });

  const {
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
  } = useRecordEditor(form, refreshRecords, refreshBatch);

  if (batchLoading)
    return (
      <div className="p-10 text-center text-muted-foreground animate-pulse">
        正在加载批次数据...
      </div>
    );

  if (batchError || !batch)
    return (
      <div className="container max-w-screen-2xl mx-auto py-8 px-4 sm:px-8">
        <div className="flex flex-col items-center justify-center p-10 space-y-4 border rounded-lg bg-background/50">
          <div className="text-xl font-semibold text-destructive">
            未找到该批次
          </div>
          <p className="text-muted-foreground">
            所请求的批次无法找到或已被删除。
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/">返回控制面板</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div className="container max-w-screen-2xl mx-auto py-8 px-4 sm:px-8 space-y-6">
      <BatchHeader
        batch={batch}
        handleDownload={handleDownload}
        handleSaveBatchName={handleSaveBatchName}
        handlePause={handlePause}
        handleResume={handleResume}
        handleCancel={handleCancel}
      />

      <StatsCards batch={batch} />

      <RecordTable
        records={records}
        loading={loading}
        total={total}
        page={page}
        setPage={setPage}
        pageSize={pageSize}
        filter={filter}
        setFilter={setFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        handleSearch={handleSearch}
        handleClearSearch={handleClearSearch}
        handleEditClick={handleEditClick}
      />

      <EditRecordSheet
        editingRecord={editingRecord}
        setEditingRecord={setEditingRecord}
        form={form}
        handleSaveEdit={handleSaveEdit}
        history={history}
        editingVersionId={editingVersionId}
        setEditingVersionId={setEditingVersionId}
        tempReason={tempReason}
        setTempReason={setTempReason}
        handleUpdateReason={handleUpdateReason}
        rollbackVersionId={rollbackVersionId}
        setRollbackVersionId={setRollbackVersionId}
        handleRollback={handleRollback}
        validationResult={validationResult}
        setValidationResult={setValidationResult}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
