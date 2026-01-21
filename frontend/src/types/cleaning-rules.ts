export const RULE_TYPES = [
  "regex",
  "replace",
  "length",
  "required",
  "date",
  "address",
] as const;

export type RuleType = (typeof RULE_TYPES)[number];

export interface CleaningRule {
  type: RuleType;
  pattern?: string;
  old?: string;
  new?: string;
  min?: number;
  max?: number;
  comp?: string;
}

export interface ColumnRuleGroup {
  column: string;
  rules: CleaningRule[];
}
