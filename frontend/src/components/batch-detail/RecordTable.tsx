import { FileText, CheckCircle, XCircle, Search, X } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OverflowTooltip } from "@/components/ui/overflow-tooltip";
import type { Record } from "./types";

interface RecordTableProps {
  records: Record[];
  loading: boolean;
  total: number;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  filter: string;
  setFilter: React.Dispatch<React.SetStateAction<string>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  handleSearch: () => void;
  handleClearSearch: () => void;
  handleEditClick: (record: Record) => void;
}

export function RecordTable({
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
  handleEditClick,
}: RecordTableProps) {
  return (
    <Card className="pt-0 gap-0!">
      <CardHeader className="p-2! pb-0! border-b">
        <div className="flex items-center justify-between pr-2">
          <Tabs value={filter} onValueChange={setFilter} className="w-auto">
            <TabsList className="gap-1 bg-transparent h-10">
              <TabsTrigger value="all" className="gap-2 px-4">
                <FileText className="h-3.5 w-3.5" />
                All Records
              </TabsTrigger>
              <TabsTrigger
                value="clean"
                className="data-[state=active]:text-green-700 gap-2 px-4"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Valid
              </TabsTrigger>
              <TabsTrigger
                value="error"
                className="data-[state=active]:text-red-700 gap-2 px-4"
              >
                <XCircle className="h-3.5 w-3.5" />
                Invalid
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative w-80 h-8 group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="搜索姓名、手机、地区..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9 pr-8 h-8 text-xs bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary/30 transition-all rounded-md"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground/50 hover:text-foreground transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <OverlayScrollbarsComponent
          options={{ scrollbars: { autoHide: "scroll" } }}
          className="w-full"
        >
          <div className="relative">
            <Table className="table-fixed">
              <TableHeader className="bg-muted/40 font-medium">
                <TableRow>
                  <TableHead className="w-[60px] text-center">#</TableHead>
                  <TableHead className="w-[120px]">Name</TableHead>
                  <TableHead className="w-[130px]">Phone</TableHead>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="min-w-[200px]">Location</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="h-[54vh]">
                {loading ? (
                  <TableRow className="h-full">
                    <TableCell colSpan={7} className="text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-8 w-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm font-medium text-muted-foreground/80">
                          Fetching records...
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : records.length === 0 ? (
                  <TableRow className="h-full">
                    <TableCell
                      colSpan={7}
                      className="h-full text-center text-muted-foreground"
                    >
                      No records found for this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  records.map((record) => {
                    const fullLocation = [
                      record.province,
                      record.city,
                      record.district,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const nameWithLorem = `${record.name}`;

                    return (
                      <TableRow key={record.id}>
                        <TableCell className="text-center text-muted-foreground font-mono text-xs">
                          {record.row_index}
                        </TableCell>
                        <TableCell className="font-medium text-foreground/90">
                          <OverflowTooltip
                            content={
                              <p className="leading-relaxed">{nameWithLorem}</p>
                            }
                          >
                            {nameWithLorem}
                          </OverflowTooltip>
                        </TableCell>
                        <TableCell className="text-foreground/80">
                          <OverflowTooltip content={record.phone}>
                            {record.phone}
                          </OverflowTooltip>
                        </TableCell>
                        <TableCell className="text-foreground/80">
                          <OverflowTooltip content={record.date || "-"}>
                            {record.date || "-"}
                          </OverflowTooltip>
                        </TableCell>
                        <TableCell className="text-foreground/80">
                          <OverflowTooltip
                            content={
                              <p className="leading-relaxed">{fullLocation}</p>
                            }
                            tooltipClassName="break-all"
                          >
                            {fullLocation}
                          </OverflowTooltip>
                        </TableCell>
                        <TableCell>
                          {record.status === "Clean" ? (
                            <Badge
                              variant="outline"
                              className="bg-green-50/50 text-green-700 border-green-200/60 shadow-none font-medium h-5 px-1.5 text-[10px]"
                            >
                              <CheckCircle className="mr-1 h-2.5 w-2.5" /> Valid
                            </Badge>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="destructive"
                                  className="w-fit shadow-none font-medium h-5 px-1.5 text-[10px] cursor-help"
                                >
                                  <XCircle className="mr-1 h-2.5 w-2.5" />{" "}
                                  Invalid
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[300px] whitespace-normal break-words  text-destructive-foreground/80 ">
                                <p className="leading-relaxed font-medium text-destructive">
                                  {record.error_message}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(record)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </OverlayScrollbarsComponent>

        {/* Pagination */}
        <div className="py-2 px-4 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            共{" "}
            <span className="font-medium text-foreground">
              {total.toLocaleString()}
            </span>{" "}
            条记录， 第{" "}
            <span className="font-medium text-foreground">{page}</span> /{" "}
            <span className="font-medium text-foreground">
              {Math.ceil(total / pageSize) || 1}
            </span>{" "}
            页
          </div>

          <Pagination className="w-auto mx-0">
            <PaginationContent>
              {/* 首页 */}
              <PaginationItem>
                <PaginationLink
                  onClick={() => setPage(1)}
                  aria-disabled={page === 1}
                  className={
                    page === 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                >
                  «
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-disabled={page === 1}
                  className={
                    page === 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
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
                        size="default"
                        className="cursor-pointer px-3 h-8 min-w-[40px]"
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ));
              })()}
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setPage((p) => Math.min(Math.ceil(total / pageSize), p + 1))
                  }
                  aria-disabled={page * pageSize >= total}
                  className={
                    page * pageSize >= total
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
              {/* 末页 */}
              <PaginationItem>
                <PaginationLink
                  onClick={() => setPage(Math.ceil(total / pageSize) || 1)}
                  aria-disabled={page * pageSize >= total}
                  className={
                    page * pageSize >= total
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                >
                  »
                </PaginationLink>
              </PaginationItem>
            </PaginationContent>
          </Pagination>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">跳转</span>
            <Input
              type="number"
              min={1}
              max={Math.ceil(total / pageSize) || 1}
              className="w-16 h-7 text-center text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const target = e.target as HTMLInputElement;
                  const value = parseInt(target.value, 10);
                  const totalPages = Math.ceil(total / pageSize) || 1;
                  if (value >= 1 && value <= totalPages) {
                    setPage(value);
                    target.value = "";
                  }
                }
              }}
            />
            <span className="text-muted-foreground">页</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
