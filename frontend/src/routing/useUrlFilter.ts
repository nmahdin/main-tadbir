import { useSearchParams } from 'react-router-dom';
export function useUrlFilter<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams();
  return [(params.get(key) || fallback) as T, value => setParams(previous => {
    const next = new URLSearchParams(previous);
    if (value === fallback || !value) next.delete(key); else next.set(key, value);
    return next;
  }, { replace: true })];
}
