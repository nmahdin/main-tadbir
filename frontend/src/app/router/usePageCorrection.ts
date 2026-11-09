import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
/** A deleted final row or an out-of-range shared URL should return to a real server page. */
export function usePageCorrection(query: {isSuccess:boolean; isFetching:boolean; isPlaceholderData:boolean; data?: {meta?: {current_page?:number;last_page?:number}}}) {
  const [params,setParams] = useSearchParams();
  useEffect(() => {
    const current = query.data?.meta?.current_page, last = query.data?.meta?.last_page;
    if (!query.isSuccess || query.isFetching || query.isPlaceholderData || !current || !last || current <= last) return;
    const next = new URLSearchParams(params); if(last === 1) next.delete('page'); else next.set('page',String(last));
    setParams(next,{replace:true});
  },[query.isSuccess,query.isFetching,query.isPlaceholderData,query.data,params,setParams]);
}
