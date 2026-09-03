export interface RequestLogEntry {
    id: string;
    timestamp: string;
    timeStr: string;
    method: string;
    url: string;
    pathname: string;
    search: string;
    status: number;
    duration: string;
    durationMs: number;
    ip?: string;
    headers: Record<string, string>;
    params: Record<string, string>;
    query: Record<string, string>;
    body?: any;
    bodyRaw?: string;
    contentType?: string;
    responseHeaders?: Record<string, string>;
    responseBody?: any;
    responseBodyRaw?: string;
    responseContentType?: string;
}

export interface RequestLogStoreOptions {
    /**
     * Maximum number of log entries to retain in memory.
     * @default 100
     */
    maxEntries?: number;
}

export type LogListener = (entry: RequestLogEntry) => void;

let defaultInstance: RequestLogStore | null = null;

export class RequestLogStore {
    private logs: RequestLogEntry[] = [];
    private maxEntries: number;
    private listeners: Set<LogListener> = new Set();

    constructor(options?: RequestLogStoreOptions) {
        this.maxEntries = options?.maxEntries ?? 100;
    }

    /**
     * Append a new log entry. Automatically evicts the oldest entry if maxEntries is exceeded.
     * Notifies all active subscribers.
     */
    public add(entry: RequestLogEntry): void {
        this.logs.push(entry);
        if (this.logs.length > this.maxEntries) {
            this.logs.shift();
        }

        for (const listener of this.listeners) {
            try {
                listener(entry);
            } catch {
                // Ignore listener errors to keep pipeline resilient
            }
        }
    }

    /**
     * Retrieve recent logs, newest first by default or oldest first.
     */
    public getLogs(options?: { limit?: number; order?: "asc" | "desc" }): RequestLogEntry[] {
        const order = options?.order ?? "desc";
        const limit = options?.limit ?? this.logs.length;

        const copy = [...this.logs];
        if (order === "desc") {
            copy.reverse();
        }

        return copy.slice(0, limit);
    }

    /**
     * Clears all stored logs.
     */
    public clear(): void {
        this.logs = [];
    }

    /**
     * Returns the current number of stored log entries.
     */
    public get size(): number {
        return this.logs.length;
    }

    /**
     * Subscribe to real-time incoming request logs.
     * Returns an unsubscribe function.
     */
    public subscribe(listener: LogListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Current count of active subscribers.
     */
    public get subscriberCount(): number {
        return this.listeners.size;
    }
}

/**
 * Creates an isolated RequestLogStore instance.
 */
export function createRequestLogStore(options?: RequestLogStoreOptions): RequestLogStore {
    return new RequestLogStore(options);
}

/**
 * Returns the global shared RequestLogStore instance.
 */
export function getDefaultLogStore(): RequestLogStore {
    if (!defaultInstance) {
        defaultInstance = new RequestLogStore({ maxEntries: 100 });
    }
    return defaultInstance;
}
