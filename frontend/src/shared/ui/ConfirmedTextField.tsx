import React, { useEffect, useState } from 'react';

type Props = { key?:string; value: string | number; save: (value:string) => Promise<boolean>; multiline?:boolean; className?:string; disabled?:boolean; placeholder?:string; label:string; type?:string; min?:string; max?:string; rows?:number };
/** Keep drafts on failure; don't issue a network write for each keystroke. */
export function ConfirmedTextField({value,save,multiline,label,...props}:Props) {
  const [draft,setDraft]=useState(String(value ?? ''));
  useEffect(()=>setDraft(String(value ?? '')),[value]);
  const common={...props,'aria-label':label,value:draft,onChange:(e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>)=>setDraft(e.target.value),onBlur:()=>{if(draft!==String(value ?? ''))void save(draft);}};
  return multiline?<textarea {...common}/>:<input {...common}/>;
}
