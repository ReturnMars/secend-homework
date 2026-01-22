import React, { useState } from "react";
import {
  Settings2,
  Plus,
  Trash2,
  ShieldCheck,
  ChevronRight,
  Search,
  Wand2,
  AlertCircle,
  Hash,
  Calendar,
  Layers,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ColumnRuleGroup, CleaningRule } from "../../types/cleaning-rules";
import { motion, AnimatePresence } from "framer-motion";

interface RuleConfigPanelProps {
  rules: ColumnRuleGroup[];
  showRules: boolean;
  onToggleRules: () => void;
  onAddRule: (column: string) => void;
  onRemoveRule: (column: string, ruleIdx: number) => void;
  onUpdateRule: (
    column: string,
    ruleIdx: number,
    updates: Partial<CleaningRule>,
  ) => void;
}

const RULE_TYPE_ICONS: Record<string, any> = {
  regex: <Hash className="h-3.5 w-3.5" />,
  replace: <Wand2 className="h-3.5 w-3.5" />,
  length: <Layers className="h-3.5 w-3.5" />,
  required: <AlertCircle className="h-3.5 w-3.5" />,
  date: <Calendar className="h-3.5 w-3.5" />,
  address: <MapPin className="h-3.5 w-3.5" />,
};

const RuleConfigPanel: React.FC<RuleConfigPanelProps> = ({
  rules,
  showRules,
  onToggleRules,
  onAddRule,
  onRemoveRule,
  onUpdateRule,
}) => {
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);

  React.useEffect(() => {
    if (rules.length > 0 && !selectedColumn) {
      setSelectedColumn(rules[0].column);
    }
  }, [rules, selectedColumn]);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRules = rules.filter((r) =>
    r.column.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const activeGroup = rules.find((r) => r.column === selectedColumn);

  return (
    <div className="bg-background/40 backdrop-blur-xl rounded-[24px] border border-primary/10 shadow-2xl shadow-primary/5 overflow-hidden transition-all duration-500">
      {/* Header */}
      <div
        className={clsx(
          "px-8 py-5 flex items-center justify-between border-b border-primary/5 transition-colors",
          showRules ? "bg-primary/3" : "hover:bg-primary/2 cursor-pointer",
        )}
        onClick={!showRules ? onToggleRules : undefined}
      >
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-2xl bg-linear-to-tr from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-inner">
            <Settings2 className="h-5 w-5 animate-pulse-slow" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground/80">
              规则引擎
            </h3>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider opacity-60">
              配置数据清洗与验证逻辑
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex -space-x-2">
            {rules.slice(0, 3).map((r, i) => (
              <div
                key={i}
                className="h-6 w-6 rounded-full border-2 border-background bg-primary/10 flex items-center justify-center text-[8px] font-black text-primary"
              >
                {r.column[0].toUpperCase()}
              </div>
            ))}
            {rules.length > 3 && (
              <div className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[8px] font-black text-muted-foreground">
                +{rules.length - 3}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onToggleRules();
            }}
          >
            <span className="text-[11px] font-black uppercase tracking-widest mr-2">
              {showRules ? "折叠面板" : "展开配置"}
            </span>
            <motion.div animate={{ rotate: showRules ? 180 : 0 }}>
              <ChevronRight className="h-4 w-4" />
            </motion.div>
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="flex h-[480px]">
              {/* Sidebar: Column List */}
              <div className="w-64 border-r border-primary/5 bg-primary/1 flex flex-col">
                <div className="p-4 border-b border-primary/5">
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors z-10" />
                    <Input
                      placeholder="搜索列名..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 custom-scrollbar">
                  {filteredRules.map((colGroup) => (
                    <button
                      key={colGroup.column}
                      onClick={() => setSelectedColumn(colGroup.column)}
                      className={clsx(
                        "w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-200 group text-left",
                        selectedColumn === colGroup.column
                          ? "bg-primary/10 text-primary shadow-sm"
                          : "hover:bg-primary/5 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2
                          className={clsx(
                            "h-3 w-3 shrink-0 transition-opacity",
                            colGroup.rules && colGroup.rules.length > 0
                              ? "opacity-100 text-green-500"
                              : "opacity-20",
                          )}
                        />
                        <span className="text-[11px] font-bold uppercase truncate tracking-wider">
                          {colGroup.column}
                        </span>
                      </div>
                      <Badge variant="secondary" className="font-black">
                        {colGroup.rules ? colGroup.rules.length : 0}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Area: Rule Editor */}
              <div className="flex-1 overflow-y-auto bg-background/20 relative custom-scrollbar">
                {activeGroup ? (
                  <div
                    key={activeGroup.column}
                    className="p-8 space-y-8 animate-in fade-in slide-in-from-right-4 duration-300"
                  >
                    <div className="flex items-center justify-between sticky top-0 bg-transparent z-10">
                      <div>
                        <h4 className="text-xl font-black text-foreground flex items-center gap-2">
                          <ShieldCheck className="h-6 w-6 text-primary" />
                          {activeGroup.column}
                        </h4>
                        <p className="text-[11px] text-muted-foreground font-medium mt-1 uppercase tracking-widest opacity-60">
                          为此字段配置数据校验流水线
                        </p>
                      </div>
                      <Button
                        onClick={() => onAddRule(activeGroup.column)}
                        size="sm"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        <span>添加规则</span>
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <AnimatePresence mode="popLayout">
                        {activeGroup.rules &&
                          activeGroup.rules.map((rule, idx) => (
                            <motion.div
                              key={`${activeGroup.column}-${idx}`}
                              initial={{ scale: 0.95, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.95, opacity: 0 }}
                              className="bg-muted/30 backdrop-blur-sm rounded-2xl border border-primary/5 p-5 relative group"
                            >
                              <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />

                              <div className="flex items-start gap-6">
                                <div className="flex flex-col gap-2 min-w-[120px]">
                                  <label className="text-[9px] font-black text-primary/60 uppercase tracking-widest ml-1">
                                    处理类型
                                  </label>
                                  <div className="grid grid-cols-1 gap-1 relative">
                                    <Select
                                      value={rule.type}
                                      onValueChange={(value) =>
                                        onUpdateRule(activeGroup.column, idx, {
                                          type: value as any,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-9 min-w-[130px] pl-9 text-[11px] font-black uppercase tracking-wider bg-background/80 border-primary/10 rounded-xl">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary">
                                          {RULE_TYPE_ICONS[rule.type]}
                                        </div>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="regex">
                                          正则匹配
                                        </SelectItem>
                                        <SelectItem value="replace">
                                          内容替换
                                        </SelectItem>
                                        <SelectItem value="length">
                                          长度限制
                                        </SelectItem>
                                        <SelectItem value="required">
                                          必填校验
                                        </SelectItem>
                                        <SelectItem value="date">
                                          日期清洗
                                        </SelectItem>
                                        <SelectItem value="address">
                                          地址解析
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                <div className="flex-1 space-y-2">
                                  <label className="text-[9px] font-black text-foreground/40 uppercase tracking-widest ml-1">
                                    Configuration
                                  </label>
                                  <div className="bg-background/40 rounded-xl p-3 border border-primary/5 min-h-[46px] flex items-center">
                                    {rule.type === "regex" && (
                                      <div className="flex items-center gap-3 w-full">
                                        <Hash className="h-4 w-4 text-primary opacity-40 shrink-0" />
                                        <Input
                                          className="font-mono text-sm"
                                          placeholder="正则表达式 (例如: ^1\d{10}$)"
                                          value={rule.pattern || ""}
                                          onChange={(e) =>
                                            onUpdateRule(
                                              activeGroup.column,
                                              idx,
                                              {
                                                pattern: e.target.value,
                                              },
                                            )
                                          }
                                        />
                                      </div>
                                    )}

                                    {rule.type === "replace" && (
                                      <div className="flex items-center gap-4 w-full min-w-0">
                                        <div className="flex-1 min-w-0">
                                          <Input
                                            placeholder="查找内容..."
                                            value={rule.old || ""}
                                            onChange={(e) =>
                                              onUpdateRule(
                                                activeGroup.column,
                                                idx,
                                                {
                                                  old: e.target.value,
                                                },
                                              )
                                            }
                                          />
                                        </div>
                                        <ChevronRight className=" text-muted-foreground opacity-30 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <Input
                                            placeholder="替换为..."
                                            className="text-primary font-bold"
                                            value={rule.new || ""}
                                            onChange={(e) =>
                                              onUpdateRule(
                                                activeGroup.column,
                                                idx,
                                                {
                                                  new: e.target.value,
                                                },
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {rule.type === "length" && (
                                      <div className="flex items-center gap-8 w-full">
                                        <div className="flex items-center gap-3">
                                          <span className="text-[10px] font-black opacity-30 uppercase tracking-tighter">
                                            最小
                                          </span>
                                          <Input
                                            type="number"
                                            className="w-20 text-center"
                                            value={rule.min || ""}
                                            onChange={(e) =>
                                              onUpdateRule(
                                                activeGroup.column,
                                                idx,
                                                {
                                                  min:
                                                    parseInt(e.target.value) ||
                                                    0,
                                                },
                                              )
                                            }
                                          />
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className="text-[10px] font-black opacity-30 uppercase tracking-tighter">
                                            最大
                                          </span>
                                          <Input
                                            type="number"
                                            className="w-20 text-center"
                                            value={rule.max || ""}
                                            onChange={(e) =>
                                              onUpdateRule(
                                                activeGroup.column,
                                                idx,
                                                {
                                                  max:
                                                    parseInt(e.target.value) ||
                                                    0,
                                                },
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {(rule.type === "required" ||
                                      rule.type === "date") && (
                                      <div className="flex items-center gap-2 text-primary/60">
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">
                                          {rule.type === "required"
                                            ? "字段不能为空"
                                            : "转换为 YYYY-MM-DD 格式"}
                                        </span>
                                      </div>
                                    )}

                                    {rule.type === "address" && (
                                      <div className="flex items-center gap-8 w-full">
                                        <div className="flex items-center gap-3">
                                          <span className="text-[10px] font-black opacity-30 uppercase tracking-tighter">
                                            解析组件
                                          </span>
                                          <Select
                                            value={rule.comp || "province"}
                                            onValueChange={(value) =>
                                              onUpdateRule(
                                                activeGroup.column,
                                                idx,
                                                {
                                                  comp: value as any,
                                                },
                                              )
                                            }
                                          >
                                            <SelectTrigger className="h-9 min-w-[100px] text-sm font-medium bg-background/80 border-primary/10 rounded-md">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="province">
                                                省份
                                              </SelectItem>
                                              <SelectItem value="city">
                                                城市
                                              </SelectItem>
                                              <SelectItem value="district">
                                                区县
                                              </SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="pt-6">
                                  <button
                                    onClick={() =>
                                      onRemoveRule(activeGroup.column, idx)
                                    }
                                    className="h-10 w-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-300 transform hover:rotate-12"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                      </AnimatePresence>

                      {(!activeGroup.rules ||
                        activeGroup.rules.length === 0) && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="py-20 flex flex-col items-center justify-center text-muted-foreground/30 border-2 border-dashed border-primary/5 rounded-[32px]"
                        >
                          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                            <Plus className="h-8 w-8" />
                          </div>
                          <p className="text-sm font-black uppercase tracking-[0.3em]">
                            暂无运行规则
                          </p>
                          <p className="text-[10px] font-medium mt-2">
                            添加您的第一条规则以开始清洗此列数据
                          </p>
                        </motion.div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground/20">
                    <Layers className="h-16 w-16 mb-4" />
                    <p className="text-sm font-black uppercase tracking-[0.3em]">
                      请选择一列
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(var(--primary-rgb), 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(var(--primary-rgb), 0.2);
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.95); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `,
        }}
      />
    </div>
  );
};

export default RuleConfigPanel;
