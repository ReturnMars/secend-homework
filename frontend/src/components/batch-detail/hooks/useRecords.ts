import { useState, useEffect, useCallback } from 'react';
import type { Record } from '../types';

export function useRecords(id: string | undefined) {
    const [records, setRecords] = useState<Record[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize] = useState(10);
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [loading, setLoading] = useState(true);

    const handleSearch = () => {
        setDebouncedSearch(searchQuery);
        setPage(1);
    };

    const handleClearSearch = () => {
        setSearchQuery('');
        setDebouncedSearch('');
        setPage(1);
    };

    const fetchRecords = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:8080/api/batches/${id}/records?page=${page}&pageSize=${pageSize}&filter=${filter}&search=${encodeURIComponent(debouncedSearch)}`);
            const data = await res.json();
            setRecords(data.data || []);
            setTotal(data.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id, page, pageSize, filter, debouncedSearch]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    return {
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
        refreshRecords: fetchRecords
    };
}
