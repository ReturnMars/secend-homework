import React, { useState } from 'react';
import { Download, CheckCircle, RotateCcw, AlertTriangle, FileText, Database, Activity } from 'lucide-react';
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
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"

interface ReportCardProps {
    stats: ProcessStats;
    onReset: () => void;
}

const ReportCard: React.FC<ReportCardProps> = ({ stats, onReset }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const handleDownload = () => {
        window.location.href = `http://localhost:8080/export/${stats.result_id}`;
    };

    const totalPages = Math.ceil((stats.preview_data?.length || 0) / pageSize);
    const currentData = stats.preview_data?.slice((currentPage - 1) * pageSize, currentPage * pageSize) || [];

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
                            Export CSV
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

                <Card className="shadow-sm border-border/60">
                    <CardContent className="p-0">
                        <div className="rounded-none border-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent bg-muted/40">
                                        <TableHead className="w-[60px] pl-6 font-semibold">No.</TableHead>
                                        <TableHead className="font-semibold">Name</TableHead>
                                        <TableHead className="font-semibold">Phone</TableHead>
                                        <TableHead className="font-semibold">Date</TableHead>
                                        <TableHead className="font-semibold">Location Details</TableHead>
                                        <TableHead className="font-semibold text-right pr-6">Validation</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {currentData.length > 0 ? (
                                        currentData.map((row, idx) => {
                                            const isError = row.status !== 'Clean';
                                            const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                                            return (
                                                <TableRow key={idx} className="hover:bg-muted/30 transition-colors">
                                                    <TableCell className="font-medium text-muted-foreground pl-6 w-[60px]">{rowNumber}</TableCell>
                                                    <TableCell className="font-medium text-foreground">{row.name || '-'}</TableCell>
                                                    <TableCell className="font-mono text-xs">{row.phone || '-'}</TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">{row.join_date || '-'}</TableCell>
                                                    <TableCell className="max-w-[200px]" title={`${row.province}${row.city}${row.district}`}>
                                                        {isError ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <span className="text-sm text-muted-foreground italic truncate cursor-help">
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
                                                    <TableCell className="text-right pr-6">
                                                        {isError ? (
                                                            <Badge variant="destructive" className="items-center gap-1.5 shadow-sm">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                <span className="truncate max-w-[100px]" title={row.status}>
                                                                    {row.status.replace(/^Error:\s*/, '')}
                                                                </span>
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 items-center gap-1.5 shadow-sm inline-flex">
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
                                                    <p>No records found to display.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                    <CardFooter className="py-4 border-t border-border/40 bg-muted/10">
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (currentPage > 1) setCurrentPage(currentPage - 1);
                                        }}
                                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : "hover:bg-background"}
                                    />
                                </PaginationItem>

                                {getPageNumbers().map((page, index) => (
                                    <PaginationItem key={index}>
                                        {page === '...' ? (
                                            <span className="flex h-9 w-9 items-center justify-center text-sm text-muted-foreground">...</span>
                                        ) : (
                                            <PaginationLink
                                                href="#"
                                                isActive={currentPage === page}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setCurrentPage(Number(page));
                                                }}
                                                className={currentPage === page ? "shadow-sm" : ""}
                                            >
                                                {page}
                                            </PaginationLink>
                                        )}
                                    </PaginationItem>
                                ))}

                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                                        }}
                                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-background"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </CardFooter>
                </Card>

            </div>
        </TooltipProvider>
    );
};

export default ReportCard;
