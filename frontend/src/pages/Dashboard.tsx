import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import {
  FileSpreadsheet,
  Plus,
  Activity,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  useEffect(() => {
    // api wrapper automatically attaches token from localStorage
    api
      .get<Batch[]>("/batches")
      .then((data) => {
        if (Array.isArray(data)) {
          setBatches(data);
        } else {
          setBatches([]);
        }
      })
      .catch((err) => {
        console.error("Dashboard fetch error:", err);
        setBatches([]);
      });
  }, []);

  const handleUploadSuccess = (stats: any) => {
    setIsUploadOpen(false);
    navigate(`/batches/${stats.result_id}`);
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
                <th className="py-3 px-4 font-medium">Progress</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 text-right font-medium">Date</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  className="group hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/batches/${batch.id}`)}
                >
                  <td className="py-3 px-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-105 transition-transform">
                        <FileSpreadsheet className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {batch.original_filename}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5 opacity-70">
                          ID: {batch.id}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1.5 max-w-[140px]">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {batch.success_count.toLocaleString()} /{" "}
                          {batch.total_rows.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            batch.success_count / batch.total_rows >= 0.9
                              ? "bg-green-500"
                              : batch.success_count / batch.total_rows >= 0.5
                              ? "bg-blue-500"
                              : "bg-amber-500"
                          }`}
                          style={{
                            width: `${
                              batch.total_rows > 0
                                ? (batch.success_count / batch.total_rows) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      variant="outline"
                      className={`font-normal border-0 px-2 py-0.5 ${
                        batch.status === "Completed"
                          ? "bg-green-500/10 text-green-700 hover:bg-green-500/20"
                          : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                          batch.status === "Completed"
                            ? "bg-green-500"
                            : "bg-gray-500"
                        }`}
                      />
                      {batch.status}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right text-muted-foreground font-mono text-xs">
                    {new Date(batch.created_at).toLocaleString(undefined, {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}
                  </td>
                  <td className="py-3 px-4 pr-6 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </td>
                </tr>
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
