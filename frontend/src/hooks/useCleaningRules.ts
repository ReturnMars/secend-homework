import { useState, useCallback } from "react";
import type { ColumnRuleGroup, CleaningRule } from "../types/cleaning-rules";

export const DEFAULT_RULES: ColumnRuleGroup[] = [
  {
    column: "phone",
    rules: [
      { type: "replace", old: " ", new: "" },
      { type: "regex", pattern: "^1[3-9]\\d{9}$" },
    ],
  },
  {
    column: "name",
    rules: [{ type: "required" }, { type: "length", min: 2, max: 20 }],
  },
  {
    column: "date",
    rules: [{ type: "date" }],
  },
  {
    column: "address_province",
    rules: [{ type: "address", comp: "province" }],
  },
  {
    column: "address_city",
    rules: [{ type: "address", comp: "city" }],
  },
  {
    column: "address_district",
    rules: [{ type: "address", comp: "district" }],
  },
];

export const useCleaningRules = (initialRules: ColumnRuleGroup[] = []) => {
  const [rules, setRules] = useState<ColumnRuleGroup[]>(initialRules);
  const [showRules, setShowRules] = useState(false);

  const addRule = useCallback((column: string) => {
    setRules((prev) =>
      prev.map((c) => {
        if (c.column === column) {
          return { ...c, rules: [...c.rules, { type: "regex", pattern: "" }] };
        }
        return c;
      }),
    );
  }, []);

  const removeRule = useCallback((column: string, ruleIdx: number) => {
    setRules((prev) =>
      prev.map((c) => {
        if (c.column === column) {
          return {
            ...c,
            rules: c.rules.filter((_, i) => i !== ruleIdx),
          };
        }
        return c;
      }),
    );
  }, []);

  const updateRule = useCallback(
    (column: string, ruleIdx: number, updates: Partial<CleaningRule>) => {
      setRules((prev) =>
        prev.map((c) => {
          if (c.column === column) {
            const newRules = [...c.rules];
            newRules[ruleIdx] = {
              ...newRules[ruleIdx],
              ...updates,
            } as CleaningRule;
            return { ...c, rules: newRules };
          }
          return c;
        }),
      );
    },
    [],
  );

  const toggleRules = useCallback(() => setShowRules((prev) => !prev), []);

  return {
    rules,
    showRules,
    addRule,
    removeRule,
    updateRule,
    toggleRules,
    setRules,
  };
};
