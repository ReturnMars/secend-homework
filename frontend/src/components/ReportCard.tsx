import React, { useState, useEffect } from 'react';
import { Download, CheckCircle, RotateCcw, AlertTriangle, FileText, Database, Activity, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import type { ProcessStats } from '../App';
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
} from "@/components/ui/pagination"

interface ReportCardProps {
    stats: ProcessStats;
    onReset: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ stats, onReset }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState<'all' | 'clean' | 'error'>('all');
    const pageSize = 10;

    useEffect(() => {
        setCurrentPage(1);
    }, [filterStatus]);

    const handleDownload = () => {
        window.location.href = `http://localhost:8080/export/${stats.result_id}`;
    };

    const filteredData = (stats.preview_data || []).filter(item => {
        if (filterStatus === 'all') return true;
        if (filterStatus === 'clean') return item.status === 'Clean';
        if (filterStatus === 'error') return item.status !== 'Clean';
        return true;
    });

    const totalPages = Math.ceil(filteredData.length / pageSize);
    const currentData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const getPageNumbers = () => {
        const pages = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 3) {
                pages.push(1, 2, 3, 4, '...', totalPages);
            } else if (currentPage >= totalPages - 2) {
                pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
            } else {
                pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
            }
        }
        return pages;
    };

    return (
        <TooltipProvider>
            <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

                {/* Header / Actions Area */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">Processing Report</h2>
                        <p className="text-muted-foreground">Detailed analysis of your recent data upload.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={onReset} className="h-9">
                            <RotateCcw className="mr-2 h-4 w-4 text-muted-foreground" />
                            Start Over
                        </Button>
                        <Button onClick={handleDownload} className="h-9">
                            <Download className="mr-2 h-4 w-4" />
                            Export XLSX
                        </Button>
                    </div>
                </div>

                {/* Metrics Cards Grid - SaaS Style */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="shadow-sm border-border/60 bg-background/50 backdrop-blur-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
                            <Database className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold tracking-tight">{stats.total_rows.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground mt-1">Processed from upload</p>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border-green-200/50 bg-green-50/50 backdrop-blur-sm dark:bg-green-900/10 dark:border-green-900/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">Successful</CardTitle>
                            <Activity className="h-4 w-4 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold tracking-tight text-green-700 dark:text-green-400">{stats.success_rows.toLocaleString()}</div>
                            <p className="text-xs text-green-600/80 mt-1">
                                {((stats.success_rows / stats.total_rows) * 100).toFixed(1)}% Success Rate
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="shadow-sm border-destructive/20 bg-destructive/5 backdrop-blur-sm">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-destructive">Anomalies Detected</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold tracking-tight text-destructive">{stats.failed_rows.toLocaleString()}</div>
                            <p className="text-xs text-destructive/80 mt-1">Requires attention</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">

                    </div>

                    <Card className="shadow-sm border-border/60 overflow-hidden py-0 gap-0">
                        <CardContent className="p-0">
                            <div className="flex  items-center gap-2 p-1 bg-muted/50  border border-border/40">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFilterStatus('all')}
                                    className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${filterStatus === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'}`}
                                >
                                    All Data
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFilterStatus('clean')}
                                    className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${filterStatus === 'clean' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'}`}
                                >
                                    <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                                    Normal
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFilterStatus('error')}
                                    className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${filterStatus === 'error' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'}`}
                                >
                                    <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-destructive" />
                                    Abnormal
                                </Button>
                            </div>
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="hover:bg-muted/30 border-b border-border/60">
                                        <TableHead className="w-[60px] pl-6 font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">No.</TableHead>
                                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Name</TableHead>
                                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Phone</TableHead>
                                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Date</TableHead>
                                        <TableHead className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Location Details</TableHead>
                                        <TableHead className="sticky right-0 z-20 bg-muted/30 backdrop-blur-sm font-semibold text-xs uppercase tracking-wider text-muted-foreground/80 text-right pr-6 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)]">Validation</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {currentData.length > 0 ? (
                                        currentData.map((row, idx) => {
                                            const isError = row.status !== 'Clean';
                                            const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                                            return (
                                                <TableRow key={idx} className="group hover:bg-muted/10 transition-colors border-border/40">
                                                    <TableCell className="font-medium text-muted-foreground pl-6 w-[60px]">{rowNumber}</TableCell>
                                                    <TableCell className="font-medium text-foreground">{row.name || '-'}</TableCell>
                                                    <TableCell className="font-mono text-xs text-muted-foreground">{row.phone || '-'}</TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">{row.join_date || '-'}</TableCell>
                                                    <TableCell className="max-w-[200px]">
                                                        {isError ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="text-sm text-muted-foreground italic truncate cursor-help max-w-[180px] block">
                                                                            {row.original_address || '-'}
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>{row.original_address}</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                                <span className="text-[10px] text-orange-500/80 font-medium">
                                                                    Original Input
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-sm font-medium text-foreground">
                                                                    {row.province} <span className="text-muted-foreground/40 mx-1">/</span> {row.city}
                                                                </span>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="text-xs text-muted-foreground truncate cursor-help max-w-[180px] block">
                                                                            {row.district}
                                                                        </span>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent>
                                                                        <p>{row.city} {row.district}</p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="sticky right-0 z-10 bg-card group-hover:bg-muted/50 transition-colors text-right pr-6 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.05)] border-l border-transparent">
                                                        {isError ? (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Badge variant="destructive" className="items-center gap-1.5 shadow-sm px-2 py-0.5 h-6 cursor-help">
                                                                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                                                        <span className="truncate max-w-[80px]">
                                                                            {row.status.replace(/^Error:\s*/, '')}
                                                                        </span>
                                                                    </Badge>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="left">
                                                                    <p className="max-w-[240px] break-words">{row.status}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-emerald-50/50 text-emerald-700 border-emerald-200/60 hover:bg-emerald-100/50 items-center gap-1.5 shadow-sm inline-flex px-2 py-0.5 h-6">
                                                                <CheckCircle className="w-3 h-3" /> Clean
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-32 text-center">
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                    <Database className="h-8 w-8 opacity-20" />
                                                    <p>No records found.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                        <CardFooter className="py-3 border-t border-border/60 bg-muted/30 flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">
                                Showing <span className="font-medium">{filteredData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to <span className="font-medium">{Math.min(currentPage * pageSize, filteredData.length)}</span> of <span className="font-medium">{filteredData.length}</span> entries
                            </div>
                            <Pagination className="w-auto m-0 flex-none">
                                <PaginationContent className="gap-2">
                                    <PaginationItem>
                                        <PaginationLink
                                            href="#"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                if (currentPage > 1) setCurrentPage(currentPage - 1);
                                            }}
                                            className={currentPage <= 1 ? "pointer-events-none opacity-50 h-8 w-8 p-0" : "h-8 w-8 p-0 bg-background hover:bg-background/80 border"}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            <span className="sr-only">Previous</span>
                                        </PaginationLink>
                                    </PaginationItem>

                                    {getPageNumbers().map((page, index) => (
                                        <PaginationItem key={index}>
                                            {page === '...' ? (
                                                <span className="flex h-8 w-8 items-center justify-center text-xs text-muted-foreground">...</span>
                                            ) : (
                                                <PaginationLink
                                                    href="#"
                                                    isActive={currentPage === page}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setCurrentPage(Number(page));
                                                    }}
                                                    className={`h-8 w-8 text-xs ${currentPage === page ? "shadow-sm border-primary/20 bg-primary/5 text-primary hover:bg-primary/10" : "bg-background border hover:bg-muted/50"}`}
                                                >
                                                    {page}
                                                </PaginationLink>
                                            )}
                                        </PaginationItem>
                                    ))}

                                    <PaginationItem>
                                        <PaginationLink
                                            href="#"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                                            }}
                                            className={currentPage >= totalPages ? "pointer-events-none opacity-50 h-8 w-8 p-0" : "h-8 w-8 p-0 bg-background hover:bg-background/80 border"}
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                            <span className="sr-only">Next</span>
                                        </PaginationLink>
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </TooltipProvider >
    );
};

export default ReportCard;
