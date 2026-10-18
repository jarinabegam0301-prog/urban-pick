"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

type State<T> = {
  data: T | null;
  error: string | null;
  /** HTTP status of the last request failure, or 0 when the service was unreachable. */
  errorStatus: number | null;
  loading: boolean;
};

/**
 * Loads data in the browser and reloads when `key` changes.
 * A 401 response is reported through `onUnauthorized`.
 */
export function useApi<T>(
  load: () => Promise<T>,
  key: string,
  onUnauthorized?: () => void,
): State<T> & { reload: () => void; setData: (data: T) => void } {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    errorStatus: null,
    loading: true,
  });
  const [version, setVersion] = useState(0);
  const loadRef = useRef(load);
  const unauthorizedRef = useRef(onUnauthorized);

  useEffect(() => {
    loadRef.current = load;
    unauthorizedRef.current = onUnauthorized;
  });

  useEffect(() => {
    let active = true;
    loadRef
      .current()
      .then((data) => {
        if (active) setState({ data, error: null, errorStatus: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status = error instanceof ApiError ? error.status : 0;
        if (status === 401) unauthorizedRef.current?.();
        setState((current) => ({
          data: current.data,
          error: error instanceof Error ? error.message : "Something went wrong.",
          errorStatus: status,
          loading: false,
        }));
      });
    return () => {
      active = false;
    };
  }, [key, version]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null, errorStatus: null }));
    setVersion((v) => v + 1);
  }, []);

  const setData = useCallback((data: T) => {
    setState({ data, error: null, errorStatus: null, loading: false });
  }, []);

  return { ...state, reload, setData };
}
