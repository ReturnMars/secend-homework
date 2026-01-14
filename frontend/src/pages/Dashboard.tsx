import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { FileSpreadsheet, Plus, Activity, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import UploadZone from "../components/UploadZone";
import { BatchRow } from "../components/BatchRow";

interface Batch {
  id: number;
  original_filename: string;
  status: string;
  total_rows: number;
  success_count: number;
  created_at: string;
}

export default function Dashboard() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const navigate = useNavigate();

  const fetchBatches = async () => {
    try {
      const data = await api.get<Batch[]>("/batches");
      if (Array.isArray(data)) {
        setBatches(data);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  };

  useEffect(() => {
    fetchBatches();
    // 轮询列表中批次的基本状态，主要为了发现新上传的记录
    const timer = setInterval(fetchBatches, 10000);
    return () => clearInterval(timer);
  }, []);

  const handleUploadSuccess = () => {
    setIsUploadOpen(false);
    fetchBatches();
  };

  return (
    <div className="container max-w-screen-2xl mx-auto py-10 px-4 sm:px-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage and track your data cleaning pipelines.
          </p>
        </div>
        <Drawer open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DrawerTrigger asChild>
            <Button className="shadow-lg hover:shadow-xl transition-all">
              <Plus className="mr-2 h-4 w-4" /> New Import
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="mx-auto w-full max-w-lg">
              <DrawerHeader>
                <DrawerTitle>Upload New Dataset</DrawerTitle>
                <DrawerDescription>
                  Drag and drop your Excel/CSV file here to start cleaning.
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-4 pb-0">
                <UploadZone onSuccess={handleUploadSuccess} />
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Processed */}
        <Card className="bg-card hover:shadow-lg transition-all duration-300 border-border/60 group relative overflow-hidden">
          <div className="absolute -top-12 -right-12 h-48 w-48 bg-blue-500/5 rounded-full blur-3xl transition-all duration-500 group-hover:bg-blue-500/10 pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground tracking-tight">
              Total Records
            </CardTitle>
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold text-foreground tracking-tighter">
              {batches
                .reduce((acc, b) => acc + b.total_rows, 0)
                .toLocaleString()}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-2">
              <span className="flex items-center text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full mr-2 font-medium">
                <Activity className="h-3 w-3 mr-1" /> +12.5%
              </span>
              <span className="opacity-80">from last month</span>
            </div>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card className="bg-card hover:shadow-lg transition-all duration-300 border-border/60 group relative overflow-hidden">
          <div className="absolute -top-12 -right-12 h-48 w-48 bg-green-500/5 rounded-full blur-3xl transition-all duration-500 group-hover:bg-green-500/10 pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground tracking-tight">
              Success Rate
            </CardTitle>
            <Activity className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent className="relative z-10">
            {(() => {
              const total = batches.reduce((acc, b) => acc + b.total_rows, 0);
              const success = batches.reduce(
                (acc, b) => acc + b.success_count,
                0
              );
              const percent = total > 0 ? (success / total) * 100 : 0;

              let colorClass = "bg-primary";
              if (percent < 30) colorClass = "bg-red-500";
              else if (percent >= 60) colorClass = "bg-green-500";

              return (
                <>
                  <div className="text-3xl font-bold text-foreground tracking-tighter">
                    {percent.toFixed(1)}%
                  </div>
                  <div className="w-full bg-secondary/50 h-1.5 mt-3 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colorClass} transition-all duration-1000 ease-out`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </>
              );
            })()}
          </CardContent>
        </Card>

        {/* Last Activity */}
        <Card className="bg-card hover:shadow-lg transition-all duration-300 border-border/60 group relative overflow-hidden">
          <div className="absolute -top-12 -right-12 h-48 w-48 bg-purple-500/5 rounded-full blur-3xl transition-all duration-500 group-hover:bg-purple-500/10 pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground tracking-tight">
              Latest Import
            </CardTitle>
            <Clock className="h-5 w-5 text-purple-600" />
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-3xl font-bold text-foreground tracking-tighter">
              {batches.length > 0
                ? new Date(batches[0].created_at).toLocaleDateString(
                    undefined,
                    { month: "short", day: "numeric" }
                  )
                : "-"}
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-2">
              <span className="opacity-80">
                {batches.length > 0
                  ? new Date(batches[0].created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "No imports yet"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Recent Activity
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-8 text-xs"
            onClick={() => navigate("/history")}
          >
            View All
          </Button>
        </div>

        <div className="border rounded-xl bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/30 text-muted-foreground font-medium border-b border-border/50">
              <tr>
                <th className="py-3 px-4 w-[40%] pl-6 font-medium">
                  Batch Identifier
                </th>
                <th className="py-3 px-4 font-medium">
                  Progress & Performance
                </th>
                <th className="py-3 px-4 font-medium">Status & Control</th>
                <th className="py-3 px-4 text-right font-medium">Date</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {batches.map((batch) => (
                <BatchRow
                  key={batch.id}
                  batch={batch}
                  onStatusChange={fetchBatches}
                />
              ))}
              {batches.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No imports found. Start a new import above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
