"use client";
import { useState, useCallback } from "react";
import { Document } from "./types";

let globalDocs: Document[] = [];
let listeners: (() => void)[] = [];

export function addDocument(doc: Document) {
  globalDocs = [...globalDocs, doc];
  listeners.forEach((l) => l());
}

export function useDocuments() {
  const [docs, setDocs] = useState<Document[]>(globalDocs);

  const subscribe = useCallback(() => {
    const update = () => setDocs([...globalDocs]);
    listeners.push(update);
    return () => {
      listeners = listeners.filter((l) => l !== update);
    };
  }, []);

  // Auto subscribe on mount via useEffect pattern
  useState(() => {
    const unsub = subscribe();
    return unsub;
  });

  return docs;
}

export { globalDocs };
