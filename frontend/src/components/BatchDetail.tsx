import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle, XCircle, AlertCircle, Download,
    Filter, ArrowLeft, History as HistoryIcon, RotateCcw,
    FileText, Check, X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetClose,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const formSchema = z.object({
    name: z.string().min(1, "Name is required").transform(v => v.trim()),
    phone: z.string().min(1, "Phone is required").transform(v => v.trim()),
    date: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    reason: z.string().min(2, "Reason must be at least 2 characters"),
});

type FormValues = z.infer<typeof formSchema>;

interface Record {
    id: number;
    row_index: number;
    name: string;
    phone: string;
    date: string;
    province: string;
    city: string;
    district: string;
    address: string;
    status: string;
    error_message: string;
}

interface RecordVersion {
    id: number;
    changed_at: string;
    reason: string;
    before: string; // JSON
    after: string;  // JSON
}

interface Batch {
    id: number;
    original_filename: string;
    status: string;
    total_rows: number;
    success_count: number;
    failure_count: number;
    created_at: string;
}

export default function BatchDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // State
    const [batch, setBatch] = useState<Batch | null>(null);
    const [records, setRecords] = useState<Record[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [filter, setFilter] = useState('all'); // all, clean, error
    const [loading, setLoading] = useState(true);

    // Edit State
    const [editingRecord, setEditingRecord] = useState<Record | null>(null);
    const [history, setHistory] = useState<RecordVersion[]>([]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            phone: "",
            date: "",
            city: "",
            reason: "",
        },
    });

    const [editingVersionId, setEditingVersionId] = useState<number | null>(null);
    const [tempReason, setTempReason] = useState("");
    const [rollbackVersionId, setRollbackVersionId] = useState<number | null>(null);

    const fetchHistory = (recordId: number) => {
        fetch(`http://localhost:8080/api/records/${recordId}/history`)
            .then(res => res.json())
            .then(data => setHistory(data || []));
    };

    // Fetch Batch Info & Records
    useEffect(() => {
        if (!id) return;
        fetchBatchData();
        fetchRecords();
    }, [id, page, filter]);

    const fetchBatchData = async () => {
        try {
            const res = await fetch(`http://localhost:8080/api/batches/${id}`);
            const data = await res.json();
            setBatch(data);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchRecords = async () => {
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:8080/api/batches/${id}/records?page=${page}&pageSize=${pageSize}&filter=${filter}`);
            const data = await res.json();
            setRecords(data.data || []);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        window.location.href = `http://localhost:8080/api/batches/${id}/export`;
    };

    // Edit Logic
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

    const handleSaveEdit = async (values: FormValues) => {
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
                // Done
                form.reset({ ...values, reason: "" });
                fetchRecords();
                fetchBatchData();
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
                // Update form fields with restored data
                form.reset({
                    name: data.name,
                    phone: data.phone,
                    date: data.date,
                    city: data.city,
                    reason: "",
                });
                fetchRecords();
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

    const renderDiff = (before: string, after: string) => {
        try {
            const b = JSON.parse(before) as any;
            const a = JSON.parse(after) as any;
            const fieldMap: { [key: string]: string } = {
                'name': 'name',
                'phone': 'phone',
                'date': 'date',
                'province': 'province',
                'city': 'city',
                'district': 'district'
            };
            const changes = Object.entries(fieldMap).filter(([_, backendKey]) => String(b[backendKey] || '') !== String(a[backendKey] || ''));

            if (changes.length === 0) return null;

            return (
                <div className="mt-3 overflow-hidden rounded-md border border-slate-200 dark:border-slate-800 font-mono text-[10px] leading-tight">
                    {changes.map(([frontendKey, backendKey]) => (
                        <div key={frontendKey} className="flex flex-col border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <div className="bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2 py-1 flex items-start gap-1">
                                <span className="w-4 shrink-0 opacity-50">-</span>
                                <span className="font-bold min-w-[45px] uppercase opacity-70">{frontendKey}:</span>
                                <span className="break-all">{String(b[backendKey] || '(empty)')}</span>
                            </div>
                            <div className="bg-green-50/70 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-1 flex items-start gap-1">
                                <span className="w-4 shrink-0 opacity-50">+</span>
                                <span className="font-bold min-w-[45px] uppercase opacity-70">{frontendKey}:</span>
                                <span className="break-all font-semibold">{String(a[backendKey] || '(empty)')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            );
        } catch (e) {
            return null;
        }
    };

    if (!batch) return <div className="p-10 text-center">Loading...</div>;

    return (
        <div className="container max-w-screen-2xl mx-auto py-8 px-4 sm:px-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{batch.original_filename}</h1>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline">{batch.status}</Badge>
                            <span>Processed {new Date(batch.created_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleDownload}>
                        <Download className="mr-2 h-4 w-4" /> Export Excel
                    </Button>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="flex flex-wrap items-center gap-4 py-2">
                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50/50 text-blue-700 rounded-lg border border-blue-100 shadow-sm">
                    <Filter className="h-4 w-4" />
                    <span className="font-medium">Total: {batch.total_rows.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50/50 text-green-700 rounded-lg border border-green-100 shadow-sm">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">Valid: {batch.success_count.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50/50 text-red-700 rounded-lg border border-red-100 shadow-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Issues: {batch.failure_count.toLocaleString()}</span>
                </div>
            </div>

            {/* Data Table Section */}
            <Card className="pt-0 gap-0!">
                <CardHeader className="p-2! pb-0!  border-b">
                    <Tabs value={filter} onValueChange={setFilter} >
                        <TabsList className="gap-1">
                            <TabsTrigger value="all" className="gap-2">
                                <FileText className="h-3.5 w-3.5" />
                                All Records
                            </TabsTrigger>
                            <TabsTrigger value="clean" className="data-[state=active]:text-green-700 gap-2">
                                <CheckCircle className="h-3.5 w-3.5" />
                                Valid
                            </TabsTrigger>
                            <TabsTrigger value="error" className="data-[state=active]:text-red-700 gap-2">
                                <XCircle className="h-3.5 w-3.5" />
                                Invalid
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="relative min-h-[580px]">
                        <Table>
                            <TableHeader className="bg-muted/40 font-medium">
                                <TableRow>
                                    <TableHead className="w-[60px] text-center">#</TableHead>
                                    <TableHead className="w-[140px]">Name</TableHead>
                                    <TableHead className="w-[140px]">Phone</TableHead>
                                    <TableHead className="w-[140px]">Date</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead className="w-[120px]">Status</TableHead>
                                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-[400px] text-center">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <div className="h-8 w-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                                                <p className="text-sm font-medium text-muted-foreground/80">Fetching records...</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : records.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-[400px] text-center text-muted-foreground">
                                            No records found for this filter.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    <AnimatePresence mode="popLayout">
                                        {records.map((record) => {
                                            const MotionTableRow = motion(TableRow);
                                            return (
                                                <MotionTableRow
                                                    key={record.id}
                                                    initial={{ opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    className="group"
                                                    layout
                                                >
                                                    <TableCell className="text-center text-muted-foreground font-mono text-xs w-[60px]">{record.row_index}</TableCell>
                                                    <TableCell className="font-medium text-foreground/90 w-[120px]">{record.name}</TableCell>
                                                    <TableCell className="text-foreground/80 w-[130px]">{record.phone}</TableCell>
                                                    <TableCell className="text-foreground/80 w-[110px]">{record.date || '-'}</TableCell>
                                                    <TableCell className="text-muted-foreground/70 text-xs">
                                                        <div className="truncate max-w-[200px]" title={[record.province, record.city, record.district].filter(Boolean).join(' ')}>
                                                            {[record.province, record.city, record.district].filter(Boolean).join(' ')}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="w-[120px]">
                                                        {record.status === 'Clean' ? (
                                                            <Badge variant="outline" className="bg-green-50/50 text-green-700 border-green-200/60 shadow-none font-medium h-5 px-1.5 text-[10px]">
                                                                <CheckCircle className="mr-1 h-2.5 w-2.5" /> Valid
                                                            </Badge>
                                                        ) : (
                                                            <div className="flex flex-col gap-0.5">
                                                                <Badge variant="destructive" className="w-fit shadow-none font-medium h-5 px-1.5 text-[10px]">
                                                                    <XCircle className="mr-1 h-2.5 w-2.5" /> Invalid
                                                                </Badge>
                                                                <span className="text-[10px] leading-tight text-red-500/60 line-clamp-1" title={record.error_message}>
                                                                    {record.error_message}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right w-[90px]">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleEditClick(record)}
                                                        >
                                                            Edit
                                                        </Button>
                                                    </TableCell>
                                                </MotionTableRow>
                                            )
                                        })}
                                    </AnimatePresence>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    <div className="pt-2 border-t">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        aria-disabled={page === 1}
                                        className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                                {(() => {
                                    const totalPages = Math.ceil(total / pageSize);
                                    let start = Math.max(0, Math.min(page - 3, totalPages - 5));
                                    if (start < 0) start = 0;
                                    let end = Math.min(totalPages, start + 5);

                                    return Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .slice(start, end)
                                        .map((p) => (
                                            <PaginationItem key={p}>
                                                <PaginationLink
                                                    isActive={page === p}
                                                    onClick={() => setPage(p)}
                                                    className="cursor-pointer"
                                                >
                                                    {p}
                                                </PaginationLink>
                                            </PaginationItem>
                                        ));
                                })()}
                                <PaginationItem>
                                    <PaginationNext
                                        onClick={() => setPage(p => Math.min(Math.ceil(total / pageSize), p + 1))}
                                        aria-disabled={page * pageSize >= total}
                                        className={page * pageSize >= total ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                </CardContent>
            </Card>

            {/* Edit Sheet (Bottom) */}
            <Sheet
                open={!!editingRecord}
                onOpenChange={(open) => !open && setEditingRecord(null)}
            >
                <SheetContent
                    side="bottom"
                    className="p-0 overflow-hidden rounded-t-2xl border-t shadow-2xl transition-all duration-500 ease-in-out "
                    onPointerDownOutside={(e) => e.preventDefault()}
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Edit Record</SheetTitle>
                    </SheetHeader>

                    {/* Fixed Interactive Handle Style (Purely Visual) */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-12 z-60 flex items-center justify-center pointer-events-none">
                        <motion.div
                            initial="resting"
                            whileHover="hover"
                            className="pointer-events-auto h-full w-full flex items-center justify-center cursor-pointer"
                        >
                            <SheetClose asChild>
                                <motion.button
                                    onClick={() => setEditingRecord(null)}
                                    className="relative flex items-center justify-center backdrop-blur-md border border-zinc-500/10 shadow-sm overflow-hidden cursor-pointer"
                                    variants={{
                                        resting: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(113, 113, 122, 0.4)" },
                                        hover: {
                                            width: 28,
                                            height: 28,
                                            borderRadius: 14,
                                            backgroundColor: "rgba(39, 39, 42, 0.95)",
                                            borderColor: "rgba(39, 39, 42, 1)",
                                        }
                                    }}
                                    transition={{ type: "spring", stiffness: 600, damping: 30, mass: 0.5 }}
                                >
                                    <motion.div
                                        variants={{
                                            resting: { opacity: 0, scale: 0.5, rotate: -45 },
                                            hover: { opacity: 1, scale: 1, rotate: 0 }
                                        }}
                                        transition={{ duration: 0.1, ease: "easeOut" }}
                                    >
                                        <X className="h-3.5 w-3.5 text-zinc-100" />
                                    </motion.div>
                                </motion.button>
                            </SheetClose>
                        </motion.div>
                    </div>

                    <div className="h-full overflow-y-auto px-2 pb-2 pt-8">
                        <div className="mx-auto w-full max-w-7xl">
                            <SheetHeader className="px-0 pb-6 relative text-center">
                                <SheetTitle className="text-3xl font-bold tracking-tight">Edit Record #{editingRecord?.row_index}</SheetTitle>
                                <SheetDescription className="text-sm">
                                    Manual correction for detected data issues. All changes are logged in version history.
                                </SheetDescription>
                            </SheetHeader>

                            {editingRecord && (
                                <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 py-6 ">
                                    <div className="lg:col-span-3 space-y-8">
                                        <Form {...form}>
                                            <form onSubmit={form.handleSubmit(handleSaveEdit)} className="space-y-6">
                                                <div className="grid grid-cols-2 gap-6">
                                                    <FormField
                                                        control={form.control}
                                                        name="name"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-2">
                                                                <div className="flex items-center justify-between h-4">
                                                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</FormLabel>
                                                                    <AnimatePresence>
                                                                        {form.formState.errors.name && (
                                                                            <motion.div initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
                                                                                <FormMessage className="text-[10px] m-0 leading-none" />
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                                <FormControl>
                                                                    <Input {...field} className="h-10" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="date"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-2">
                                                                <div className="flex items-center justify-between h-4">
                                                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</FormLabel>
                                                                    <AnimatePresence>
                                                                        {form.formState.errors.date && (
                                                                            <motion.div initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
                                                                                <FormMessage className="text-[10px] m-0 leading-none" />
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                                <FormControl>
                                                                    <Input {...field} className="h-10" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name="phone"
                                                    render={({ field }) => (
                                                        <FormItem className="space-y-2">
                                                            <div className="flex items-center justify-between h-4">
                                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone Number</FormLabel>
                                                                <AnimatePresence>
                                                                    {form.formState.errors.phone && (
                                                                        <motion.div initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
                                                                            <FormMessage className="text-[10px] m-0 leading-none" />
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                            <FormControl>
                                                                <Input {...field} className="h-10 font-mono" />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />

                                                <div className="grid grid-cols-3 gap-4">
                                                    <FormField
                                                        control={form.control}
                                                        name="province"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-2">
                                                                <div className="flex items-center justify-between h-4">
                                                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Province</FormLabel>
                                                                    <AnimatePresence>
                                                                        {form.formState.errors.province && (
                                                                            <motion.div initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
                                                                                <FormMessage className="text-[10px] m-0 leading-none" />
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                                <FormControl>
                                                                    <Input {...field} className="h-10" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="city"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-2">
                                                                <div className="flex items-center justify-between h-4">
                                                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">City</FormLabel>
                                                                    <AnimatePresence>
                                                                        {form.formState.errors.city && (
                                                                            <motion.div initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
                                                                                <FormMessage className="text-[10px] m-0 leading-none" />
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                                <FormControl>
                                                                    <Input {...field} className="h-10" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={form.control}
                                                        name="district"
                                                        render={({ field }) => (
                                                            <FormItem className="space-y-2">
                                                                <div className="flex items-center justify-between h-4">
                                                                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">District</FormLabel>
                                                                    <AnimatePresence>
                                                                        {form.formState.errors.district && (
                                                                            <motion.div initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
                                                                                <FormMessage className="text-[10px] m-0 leading-none" />
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                                <FormControl>
                                                                    <Input {...field} className="h-10" />
                                                                </FormControl>
                                                            </FormItem>
                                                        )}
                                                    />
                                                </div>

                                                <FormField
                                                    control={form.control}
                                                    name="reason"
                                                    render={({ field }) => (
                                                        <FormItem className="space-y-2">
                                                            <div className="flex items-center justify-between h-4">
                                                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Correction Reason</FormLabel>
                                                                <AnimatePresence>
                                                                    {form.formState.errors.reason && (
                                                                        <motion.div initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}>
                                                                            <FormMessage className="text-[10px] m-0 leading-none" />
                                                                        </motion.div>
                                                                    )}
                                                                </AnimatePresence>
                                                            </div>
                                                            <FormControl>
                                                                <Input {...field} placeholder="e.g. Corrected name spelling or phone digit" className="h-10" />
                                                            </FormControl>
                                                        </FormItem>
                                                    )}
                                                />

                                                <div className="pt-4 flex items-center justify-end gap-3">
                                                    <SheetClose asChild>
                                                        <Button variant="outline" type="button" onClick={() => setEditingRecord(null)}>Cancel</Button>
                                                    </SheetClose>
                                                    <Button type="submit" disabled={form.formState.isSubmitting} className="min-w-[120px]">
                                                        {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
                                                    </Button>
                                                </div>
                                            </form>
                                        </Form>
                                    </div>

                                    <div className="lg:col-span-2 flex flex-col self-stretch min-h-[500px] lg:min-h-0 relative">
                                        <div className="lg:absolute lg:inset-0 flex flex-col border rounded-xl bg-muted/20 overflow-hidden shadow-sm">
                                            <div className="p-4 border-b bg-background/50">
                                                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                    <HistoryIcon className="h-4 w-4" /> Version History
                                                </h3>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-4 space-y-0">
                                                {!Array.isArray(history) || history.length === 0 ? (
                                                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                                                        <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center mb-2">
                                                            <HistoryIcon className="h-5 w-5 text-muted-foreground/50" />
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">No previous modifications tracked for this record.</p>
                                                    </div>
                                                ) : [...history].map((ver, idx) => (
                                                    <div key={ver.id} className="group relative pl-6 pb-8 last:pb-2">
                                                        {idx !== history.length - 1 && (
                                                            <div className="absolute left-[7px] top-[22px] bottom-0 w-[2px] bg-primary/20" />
                                                        )}
                                                        <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-4 border-background bg-primary shadow-sm z-10" />
                                                        <div className="flex justify-between items-center mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-medium text-muted-foreground">
                                                                    {new Date(ver.changed_at).toLocaleString()}
                                                                </span>
                                                                <Badge variant="outline" className="text-[9px] h-4 px-1 bg-background opacity-70">
                                                                    rev {history.length - idx}
                                                                </Badge>
                                                            </div>
                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <Button
                                                                    variant="ghost" size="icon" className="h-6 w-6"
                                                                    onClick={() => {
                                                                        setEditingVersionId(ver.id);
                                                                        setTempReason(ver.reason);
                                                                    }}
                                                                >
                                                                    <FileText className="h-3 w-3" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-blue-600" onClick={() => setRollbackVersionId(ver.id)}>
                                                                    <RotateCcw className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        {editingVersionId === ver.id ? (
                                                            <div className="flex gap-2 items-center mb-2">
                                                                <Input
                                                                    value={tempReason}
                                                                    onChange={e => setTempReason(e.target.value)}
                                                                    className="h-7 text-xs"
                                                                    autoFocus
                                                                />
                                                                <div className="flex shrink-0">
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => handleUpdateReason(ver.id)}>
                                                                        <Check className="h-4 w-4" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setEditingVersionId(null)}>
                                                                        <X className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-[11px] text-muted-foreground leading-snug mb-2 font-normal">
                                                                {ver.reason || "No reason provided"}
                                                            </p>
                                                        )}
                                                        {renderDiff(ver.before, ver.after)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            <AlertDialog open={rollbackVersionId !== null} onOpenChange={(open) => !open && setRollbackVersionId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认还原此版本？</AlertDialogTitle>
                        <AlertDialogDescription>
                            这将会把当前记录的数据覆盖为该历史版本的内容。此操作不可撤销（但你可以再次从历史记录中还原回来）。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => rollbackVersionId && handleRollback(rollbackVersionId)}>
                            确认还原
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}
