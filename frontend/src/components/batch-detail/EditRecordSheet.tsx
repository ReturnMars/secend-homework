import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  History as HistoryIcon,
  FileText,
  RotateCcw,
  Check,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { UseFormReturn } from "react-hook-form";
import type { Record, RecordVersion } from "./types";

interface EditRecordSheetProps {
  editingRecord: Record | null;
  setEditingRecord: (record: Record | null) => void;
  form: UseFormReturn<any>;
  handleSaveEdit: (values: any, confirmed?: any) => Promise<void>;
  history: RecordVersion[];
  editingVersionId: number | null;
  setEditingVersionId: (id: number | null) => void;
  tempReason: string;
  setTempReason: (reason: string) => void;
  handleUpdateReason: (versionId: number) => Promise<void>;
  rollbackVersionId: number | null;
  setRollbackVersionId: (id: number | null) => void;
  handleRollback: (versionId: number) => Promise<void>;
  validationResult: {
    current_status: string;
    new_status: string;
    new_error: string;
    has_changes: boolean;
  } | null;
  setValidationResult: (res: any | null) => void;
  isSubmitting: boolean;
}

export function EditRecordSheet({
  editingRecord,
  setEditingRecord,
  form,
  handleSaveEdit,
  history,
  editingVersionId,
  setEditingVersionId,
  tempReason,
  setTempReason,
  handleUpdateReason,
  rollbackVersionId,
  setRollbackVersionId,
  handleRollback,
  validationResult,
  setValidationResult,
  isSubmitting,
}: EditRecordSheetProps) {
  const renderDiff = (before: string, after: string) => {
    try {
      const b = JSON.parse(before) as any;
      const a = JSON.parse(after) as any;
      const fieldMap: { [key: string]: string } = {
        name: "name",
        phone: "phone",
        date: "date",
        province: "province",
        city: "city",
        district: "district",
      };
      const changes = Object.entries(fieldMap).filter(
        ([_, backendKey]) =>
          String(b[backendKey] || "") !== String(a[backendKey] || ""),
      );

      if (changes.length === 0) return null;

      return (
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200 dark:border-slate-800 font-mono text-[10px] leading-tight">
          {changes.map(([frontendKey, backendKey]) => (
            <div
              key={frontendKey}
              className="flex flex-col border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <div className="bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2 py-1 flex items-start gap-1">
                <span className="w-4 shrink-0 opacity-50">-</span>
                <span className="font-bold min-w-[45px] uppercase opacity-70">
                  {frontendKey}:
                </span>
                <span className="break-all">
                  {String(b[backendKey] || "(empty)")}
                </span>
              </div>
              <div className="bg-green-50/70 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-2 py-1 flex items-start gap-1">
                <span className="w-4 shrink-0 opacity-50">+</span>
                <span className="font-bold min-w-[45px] uppercase opacity-70">
                  {frontendKey}:
                </span>
                <span className="break-all font-semibold">
                  {String(a[backendKey] || "(empty)")}
                </span>
              </div>
            </div>
          ))}
        </div>
      );
    } catch (e) {
      return null;
    }
  };

  return (
    <>
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
            <SheetTitle>编辑记录</SheetTitle>
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
                    resting: {
                      width: 36,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: "rgba(113, 113, 122, 0.4)",
                    },
                    hover: {
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: "rgba(39, 39, 42, 0.95)",
                      borderColor: "rgba(39, 39, 42, 1)",
                    },
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 600,
                    damping: 30,
                    mass: 0.5,
                  }}
                >
                  <motion.div
                    variants={{
                      resting: { opacity: 0, scale: 0.5, rotate: -45 },
                      hover: { opacity: 1, scale: 1, rotate: 0 },
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
                <SheetTitle className="text-3xl font-bold tracking-tight">
                  编辑记录 #{editingRecord?.row_index}
                </SheetTitle>
                <SheetDescription className="text-sm">
                  手动纠正检测到的数据问题。所有更改都将记录在版本历史中。
                </SheetDescription>
              </SheetHeader>

              {editingRecord && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-16 py-6 ">
                  <div className="lg:col-span-3 space-y-8">
                    <Form {...form}>
                      <form
                        onSubmit={form.handleSubmit(handleSaveEdit)}
                        className="space-y-6"
                      >
                        <div className="grid grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem className="space-y-2">
                                <div className="flex items-center justify-between h-4">
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    姓名
                                  </FormLabel>
                                  <AnimatePresence>
                                    {form.formState.errors.name && (
                                      <motion.div
                                        initial={{ opacity: 0, x: 4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 4 }}
                                      >
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
                              <FormItem className="space-y-2 flex flex-col">
                                <div className="flex items-center justify-between h-4">
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    日期
                                  </FormLabel>
                                  <AnimatePresence>
                                    {form.formState.errors.date && (
                                      <motion.div
                                        initial={{ opacity: 0, x: 4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 4 }}
                                      >
                                        <FormMessage className="text-[10px] m-0 leading-none" />
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn(
                                          "h-10 pl-3 text-left font-normal border-input hover:bg-background hover:text-foreground",
                                          !field.value &&
                                            "text-muted-foreground",
                                        )}
                                      >
                                        {field.value ? (
                                          (() => {
                                            const d = new Date(field.value);
                                            return !isNaN(d.getTime()) ? (
                                              format(d, "yyyy年MM月dd日")
                                            ) : (
                                              <span>
                                                Invalid Date: {field.value}
                                              </span>
                                            );
                                          })()
                                        ) : (
                                          <span>选择日期</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    className="w-auto p-0"
                                    align="start"
                                  >
                                    <Calendar
                                      mode="single"
                                      selected={
                                        field.value
                                          ? new Date(field.value)
                                          : undefined
                                      }
                                      onSelect={(date) => {
                                        field.onChange(
                                          date
                                            ? format(date, "yyyy-MM-dd")
                                            : "",
                                        );
                                      }}
                                      disabled={(date) =>
                                        date > new Date() ||
                                        date < new Date("1900-01-01")
                                      }
                                    />
                                  </PopoverContent>
                                </Popover>
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
                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  联系电话
                                </FormLabel>
                                <AnimatePresence>
                                  {form.formState.errors.phone && (
                                    <motion.div
                                      initial={{ opacity: 0, x: 4 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      exit={{ opacity: 0, x: 4 }}
                                    >
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
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    省份
                                  </FormLabel>
                                  <AnimatePresence>
                                    {form.formState.errors.province && (
                                      <motion.div
                                        initial={{ opacity: 0, x: 4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 4 }}
                                      >
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
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    城市
                                  </FormLabel>
                                  <AnimatePresence>
                                    {form.formState.errors.city && (
                                      <motion.div
                                        initial={{ opacity: 0, x: 4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 4 }}
                                      >
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
                                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    区县/街道
                                  </FormLabel>
                                  <AnimatePresence>
                                    {form.formState.errors.district && (
                                      <motion.div
                                        initial={{ opacity: 0, x: 4 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 4 }}
                                      >
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
                                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  修改原因
                                </FormLabel>
                                <AnimatePresence>
                                  {form.formState.errors.reason && (
                                    <motion.div
                                      initial={{ opacity: 0, x: 4 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      exit={{ opacity: 0, x: 4 }}
                                    >
                                      <FormMessage className="text-[10px] m-0 leading-none" />
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="例如：纠正姓名拼写或联系电话"
                                  className="h-10"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        {/* 移除旧的内联 AnimatePresence 面板 */}

                        <div className="pt-4 flex items-center justify-end gap-3">
                          <SheetClose asChild>
                            <Button
                              variant="outline"
                              type="button"
                              onClick={() => {
                                setEditingRecord(null);
                                setValidationResult(null);
                              }}
                            >
                              取消
                            </Button>
                          </SheetClose>
                          {!validationResult && (
                            <Button
                              type="submit"
                              disabled={isSubmitting}
                              className="min-w-[120px]"
                            >
                              {isSubmitting ? "正在校验..." : "提交更改"}
                            </Button>
                          )}
                        </div>
                      </form>
                    </Form>
                  </div>

                  <div className="lg:col-span-2 flex flex-col self-stretch min-h-[500px] lg:min-h-0 relative">
                    <div className="lg:absolute lg:inset-0 flex flex-col border rounded-xl bg-muted/20 overflow-hidden shadow-sm">
                      <div className="p-4 border-b bg-background/50">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                          <HistoryIcon className="h-4 w-4" /> 版本历史
                        </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 space-y-0">
                        {!Array.isArray(history) || history.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center p-8">
                            <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center mb-2">
                              <HistoryIcon className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              该记录暂无修改历史记录。
                            </p>
                          </div>
                        ) : (
                          [...history].map((ver, idx) => (
                            <div
                              key={ver.id}
                              className="group relative pl-6 pb-8 last:pb-2"
                            >
                              {idx !== history.length - 1 && (
                                <div className="absolute left-[7px] top-[22px] bottom-0 w-[2px] bg-primary/20" />
                              )}
                              <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-4 border-background bg-primary shadow-sm z-10" />
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-medium text-muted-foreground">
                                    {(() => {
                                      const d = new Date(ver.changed_at);
                                      return !isNaN(d.getTime())
                                        ? d.toLocaleString()
                                        : "未知日期";
                                    })()}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] h-4 px-1 bg-background opacity-70"
                                  >
                                    修订版本 {history.length - idx}
                                  </Badge>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => {
                                      setEditingVersionId(ver.id);
                                      setTempReason(ver.reason);
                                    }}
                                  >
                                    <FileText className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 hover:text-blue-600"
                                    onClick={() => setRollbackVersionId(ver.id)}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              {editingVersionId === ver.id ? (
                                <div className="flex gap-2 items-center mb-2">
                                  <Input
                                    value={tempReason}
                                    onChange={(e) =>
                                      setTempReason(e.target.value)
                                    }
                                    className="h-7 text-xs"
                                    autoFocus
                                  />
                                  <div className="flex shrink-0">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-green-600"
                                      onClick={() => handleUpdateReason(ver.id)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-red-500"
                                      onClick={() => setEditingVersionId(null)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground leading-snug mb-2 font-normal">
                                  {ver.reason || "未提供修改原因"}
                                </p>
                              )}
                              {renderDiff(ver.before, ver.after)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={validationResult !== null}
        onOpenChange={(open) => !open && setValidationResult(null)}
      >
        <AlertDialogContent className="max-w-[440px] gap-6 rounded-2xl shadow-2xl border-white/10 backdrop-blur-md bg-background/95">
          <AlertDialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "p-2 rounded-full",
                  validationResult?.new_status === "Clean"
                    ? "bg-green-100 dark:bg-green-950/50"
                    : "bg-red-100 dark:bg-red-950/50",
                )}
              >
                {validationResult?.new_status === "Clean" ? (
                  <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
              </div>
              <AlertDialogTitle className="text-xl font-bold tracking-tight">
                {validationResult?.new_status === "Clean"
                  ? "验证通过"
                  : "仍存在数据验证问题"}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground/90">
              系统已根据您的修改进行了即时同步校验，结果发现该记录的状态将发生如下变化：
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border bg-accent/30 dark:bg-accent/10 border-white/5">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                  当前状态
                </span>
                <p
                  className={cn(
                    "text-sm font-mono font-extrabold",
                    validationResult?.current_status === "Clean"
                      ? "text-green-600 dark:text-green-500"
                      : "text-red-600 dark:text-red-500",
                  )}
                >
                  {validationResult?.current_status}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
              <div className="flex flex-col space-y-1.5 text-right items-end">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">
                  更新后
                </span>
                <Badge
                  variant={
                    validationResult?.new_status === "Clean"
                      ? "outline"
                      : "destructive"
                  }
                  className={cn(
                    "font-mono h-6 transition-all",
                    validationResult?.new_status === "Clean" &&
                      "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20",
                  )}
                >
                  {validationResult?.new_status === "Clean" ? "Clean" : "Error"}
                </Badge>
              </div>
            </div>

            {validationResult?.new_error && (
              <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 transition-all">
                <div className="flex gap-2 items-start">
                  <span className="text-red-500 font-bold text-xs mt-0.5">
                    !
                  </span>
                  <p className="text-[11px] leading-relaxed text-red-500/90 font-medium">
                    {validationResult.new_error}
                  </p>
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter className="sm:justify-end gap-2 pt-2">
            <AlertDialogCancel className="h-10 rounded-xl hover:bg-accent border-none bg-accent/50 text-sm font-medium transition-colors">
              返回修改
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                "h-10 px-6 rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-95",
                validationResult?.new_status === "Clean"
                  ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-950 hover:opacity-90"
                  : "bg-red-600 hover:bg-red-700 text-white",
              )}
              onClick={form.handleSubmit((values) =>
                handleSaveEdit(values, true),
              )}
            >
              确认并提交
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rollbackVersionId !== null}
        onOpenChange={(open) => !open && setRollbackVersionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认还原此版本？</AlertDialogTitle>
            <AlertDialogDescription>
              这将会把当前记录的数据覆盖为该历史版本的内容。此操作不可撤销（但你可以再次从历史记录中还原回来）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                rollbackVersionId && handleRollback(rollbackVersionId)
              }
            >
              确认还原
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
