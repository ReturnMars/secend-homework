import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    CheckCircle, XCircle, AlertCircle, Download,
    ChevronLeft, ChevronRight, Filter,
    ArrowLeft, Edit2, History
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";

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
    const [editForm, setEditForm] = useState<Partial<Record>>({});
    const [editReason, setEditReason] = useState("");
    const [history, setHistory] = useState<RecordVersion[]>([]);
    const [showHistory, setShowHistory] = useState(false);

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
        setEditForm({ ...record });
        setEditReason("");
        setHistory([]);
        // Fetch history
        fetch(`http://localhost:8080/api/records/${record.id}/history`)
            .then(res => res.json())
            .then(data => setHistory(data || []));
    };

    const handleSaveEdit = async () => {
        if (!editingRecord) return;
        try {
            const res = await fetch(`http://localhost:8080/api/records/${editingRecord.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    updates: editForm,
                    reason: editReason || "Manual correction"
                })
            });
            if (res.ok) {
                setEditingRecord(null);
                fetchRecords(); // Refresh list
                fetchBatchData(); // Refresh stats
            } else {
                alert("Failed to update");
            }
        } catch (err) {
            console.error(err);
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
                    <Button variant="outline" onClick={handleDownload}>
                        <Download className="mr-2 h-4 w-4" /> Export Excel
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50/50 border-blue-100">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-blue-600">Total Rows</p>
                            <h2 className="text-3xl font-bold text-blue-700">{batch.total_rows}</h2>
                        </div>
                        <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                            <Filter className="h-5 w-5 text-blue-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-green-50/50 border-green-100">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-green-600">Clean Records</p>
                            <h2 className="text-3xl font-bold text-green-700">{batch.success_count}</h2>
                        </div>
                        <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-red-50/50 border-red-100">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-red-600">Issues Found</p>
                            <h2 className="text-3xl font-bold text-red-700">{batch.failure_count}</h2>
                        </div>
                        <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center">
                            <AlertCircle className="h-5 w-5 text-red-600" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Data Table Section */}
            <Card>
                <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                    <Tabs value={filter} onValueChange={setFilter} className="w-[400px]">
                        <TabsList>
                            <TabsTrigger value="all">All Records</TabsTrigger>
                            <TabsTrigger value="clean" className="data-[state=active]:text-green-700">Valid</TabsTrigger>
                            <TabsTrigger value="error" className="data-[state=active]:text-red-700">Invalid</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="border-b bg-muted/40 grid grid-cols-12 gap-4 p-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <div className="col-span-1">#</div>
                        <div className="col-span-2">Name</div>
                        <div className="col-span-2">Phone</div>
                        <div className="col-span-2">Location</div>
                        <div className="col-span-3">Status</div>
                        <div className="col-span-2 text-right">Actions</div>
                    </div>

                    <div className="divide-y divide-border/50">
                        {loading ? (
                            <div className="p-10 text-center text-muted-foreground">Loading records...</div>
                        ) : records.map((record) => (
                            <motion.div
                                key={record.id}
                                layoutId={`row-${record.id}`}
                                className="grid grid-cols-12 gap-4 p-4 text-sm items-center hover:bg-muted/20 transition-colors"
                            >
                                <div className="col-span-1 text-muted-foreground font-mono">{record.row_index}</div>
                                <div className="col-span-2 font-medium">{record.name}</div>
                                <div className="col-span-2 font-mono text-muted-foreground">{record.phone}</div>
                                <div className="col-span-2 truncate text-muted-foreground" title={`${record.province} ${record.city}`}>
                                    {record.city || record.province || '-'}
                                </div>
                                <div className="col-span-3">
                                    {record.status === 'Clean' ? (
                                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                            <CheckCircle className="mr-1 h-3 w-3" /> Valid
                                        </Badge>
                                    ) : (
                                        <div className="flex flex-col gap-1">
                                            <Badge variant="destructive" className="w-fit">
                                                <XCircle className="mr-1 h-3 w-3" /> invalid
                                            </Badge>
                                            <span className="text-xs text-red-500 line-clamp-1" title={record.error_message}>
                                                {record.error_message}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-2 flex justify-end">
                                    <Button variant="ghost" size="sm" onClick={() => handleEditClick(record)}>
                                        <Edit2 className="h-4 w-4 mr-1" /> Edit
                                    </Button>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Pagination */}
                    <div className="p-4 border-t flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, total)} of {total} entries
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="sm" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Edit Sheet */}
            <Sheet open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
                <SheetContent className="overflow-y-auto sm:max-w-md w-full">
                    <SheetHeader>
                        <SheetTitle>Edit Record #{editingRecord?.row_index}</SheetTitle>
                        <SheetDescription>
                            Make corrections to the data manually. Changes will be versioned.
                        </SheetDescription>
                    </SheetHeader>

                    {editingRecord && (
                        <div className="space-y-6 py-6">
                            <div className="space-y-2">
                                <Label>Data Fields</Label>
                                <div className="grid gap-3">
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label className="text-right">Name</Label>
                                        <Input
                                            value={editForm.name || ''}
                                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                            className="col-span-2"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label className="text-right">Phone</Label>
                                        <Input
                                            value={editForm.phone || ''}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="col-span-2"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label className="text-right">Date</Label>
                                        <Input
                                            value={editForm.date || ''}
                                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                                            className="col-span-2"
                                        />
                                    </div>
                                    <div className="grid grid-cols-3 items-center gap-4">
                                        <Label className="text-right">Location</Label>
                                        <Input
                                            value={editForm.city || ''}
                                            onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                                            placeholder="City"
                                            className="col-span-2"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Correction Reason</Label>
                                <Input
                                    placeholder="e.g. Typo in phone number"
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Version History</Label>
                                    <Button variant="link" size="sm" onClick={() => setShowHistory(!showHistory)}>
                                        <History className="h-3 w-3 mr-1" /> {showHistory ? 'Hide' : 'Show'}
                                    </Button>
                                </div>
                                {showHistory && (
                                    <div className="rounded-md border bg-muted/50 p-3 space-y-3 max-h-40 overflow-y-auto text-xs">
                                        {history.length === 0 ? (
                                            <p className="text-muted-foreground text-center">No previous info</p>
                                        ) : history.map((ver) => (
                                            <div key={ver.id} className="border-b pb-2 last:border-0 last:pb-0">
                                                <div className="flex justify-between font-medium">
                                                    <span>{new Date(ver.changed_at).toLocaleString()}</span>
                                                </div>
                                                <p className="text-muted-foreground mt-1">{ver.reason}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <SheetFooter>
                        <Button variant="outline" onClick={() => setEditingRecord(null)}>Cancel</Button>
                        <Button onClick={handleSaveEdit}>Save Changes</Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}
