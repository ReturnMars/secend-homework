import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

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
    .min(1, "Name is required")
    .transform((v) => v.trim()),
  phone: z
    .string()
    .min(1, "Phone is required")
    .transform((v) => v.trim()),
  date: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  reason: z.string().min(2, "Reason must be at least 2 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export default function BatchDetail() {
  const { id } = useParams<{ id: string }>();

  // Init Logic Hooks
  const { batch, handleDownload, handleSaveBatchName, refreshBatch } =
    useBatchData(id);

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
    handleEditClick,
    handleSaveEdit,
    handleRollback,
    handleUpdateReason,
  } = useRecordEditor(form, refreshRecords, refreshBatch);

  if (!batch)
    return (
      <div className="p-10 text-center text-muted-foreground animate-pulse">
        Loading batch data...
      </div>
    );

  return (
    <div className="container max-w-screen-2xl mx-auto py-8 px-4 sm:px-8 space-y-6">
      <BatchHeader
        batch={batch}
        handleDownload={handleDownload}
        handleSaveBatchName={handleSaveBatchName}
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
      />
    </div>
  );
}
