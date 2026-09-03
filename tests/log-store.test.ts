import { describe, it, expect } from "bun:test";
import { createRequestLogStore, getDefaultLogStore, type RequestLogEntry } from "../lib/log-store";

describe("RequestLogStore", () => {
    it("should store logs and respect maxEntries", () => {
        const store = createRequestLogStore({ maxEntries: 3 });

        const createEntry = (id: string, path: string): RequestLogEntry => ({
            id,
            timestamp: new Date().toISOString(),
            timeStr: "12:00:00",
            method: "GET",
            url: path,
            pathname: path,
            search: "",
            status: 200,
            duration: "+1ms",
            durationMs: 1,
            headers: {},
            params: {},
            query: {},
        });

        store.add(createEntry("1", "/a"));
        store.add(createEntry("2", "/b"));
        store.add(createEntry("3", "/c"));
        expect(store.size).toBe(3);

        // Fourth entry evicts the first
        store.add(createEntry("4", "/d"));
        expect(store.size).toBe(3);

        const logsDesc = store.getLogs({ order: "desc" });
        expect(logsDesc.map(l => l.id)).toEqual(["4", "3", "2"]);

        const logsAsc = store.getLogs({ order: "asc" });
        expect(logsAsc.map(l => l.id)).toEqual(["2", "3", "4"]);
    });

    it("should notify subscribers in real time and unsubscribe cleanly", () => {
        const store = createRequestLogStore();
        const received: string[] = [];

        const unsubscribe = store.subscribe((entry) => {
            received.push(entry.id);
        });
        expect(store.subscriberCount).toBe(1);

        store.add({
            id: "event-1",
            timestamp: "",
            timeStr: "",
            method: "POST",
            url: "/users",
            pathname: "/users",
            search: "",
            status: 201,
            duration: "+5ms",
            durationMs: 5,
            headers: {},
            params: {},
            query: {},
        });

        expect(received).toEqual(["event-1"]);

        unsubscribe();
        expect(store.subscriberCount).toBe(0);

        store.add({
            id: "event-2",
            timestamp: "",
            timeStr: "",
            method: "GET",
            url: "/users",
            pathname: "/users",
            search: "",
            status: 200,
            duration: "+1ms",
            durationMs: 1,
            headers: {},
            params: {},
            query: {},
        });

        // Did not receive event-2 after unsubscribe
        expect(received).toEqual(["event-1"]);
    });

    it("should clear logs when clear() is called", () => {
        const store = createRequestLogStore();
        store.add({
            id: "x",
            timestamp: "",
            timeStr: "",
            method: "GET",
            url: "/",
            pathname: "/",
            search: "",
            status: 200,
            duration: "+1ms",
            durationMs: 1,
            headers: {},
            params: {},
            query: {},
        });
        expect(store.size).toBe(1);

        store.clear();
        expect(store.size).toBe(0);
        expect(store.getLogs()).toEqual([]);
    });

    it("should return a global defaultLogStore singleton", () => {
        const s1 = getDefaultLogStore();
        const s2 = getDefaultLogStore();
        expect(s1).toBe(s2);
    });
});
