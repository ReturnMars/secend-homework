export interface Record {
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

export interface RecordVersion {
    id: number;
    changed_at: string;
    reason: string;
    before: string; // JSON
    after: string;  // JSON
}

export interface Batch {
    id: number;
    original_filename: string;
    status: string;
    total_rows: number;
    success_count: number;
    failure_count: number;
    created_at: string;
}
