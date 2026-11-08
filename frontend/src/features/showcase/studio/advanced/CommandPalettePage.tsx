import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useNavigate} from 'react-router-dom';
import {Command,Search,X} from 'lucide-react';
import {Button,Card} from '../../../../shared/ui/Primitives';
import {getCommands,commandDestination,moveCommandIndex,type MockEnvironment,type CommandEntry} from './commandModel';
export function CommandPalettePage(){
 const navigate=useNavigate();
 const [environment,setEnvironment]=useState<MockEnvironment>('workspace');
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const opener=useRef<HTMLButtonElement>(null),searchInput=useRef<HTMLInputElement>(null),panel=useRef<HTMLDivElement>(null);
 const chosen=useRef(false);
 const commands=getCommands(environment,query);
 function activate(){chosen.current=false;setActive(0);setQuery('');setOpen(true);}
 function close(){setOpen(false);}
 function choose(cmd:CommandEntry){
  const target=commandDestination(cmd,environment);if(!target)return;
  chosen.current=true;setOpen(false);navigate(target);
 }
 useEffect(()=>{
  // Key binding is installed only while this isolated Studio route is mounted.
  const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(!open)activate();}else if(e.key==='Escape'&&open){e.preventDefault();close();}};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[open]);
 useEffect(()=>{
  if(!open)return;
  const studio=document.querySelector<HTMLElement>('.ods-studio');
  const previous=studio?.inert??false;if(studio)studio.inert=true;
  searchInput.current?.focus();
  return()=>{if(studio)studio.inert=previous;if(!chosen.current)opener.current?.focus();};
 },[open]);
 function keyboard(e:React.KeyboardEvent<HTMLDivElement>){
  if(e.key==='Escape'){e.preventDefault();close();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActive(x=>moveCommandIndex(x,e.key==='ArrowDown'?'down':'up',commands.length));return;}
  if(e.key==='Enter'&&commands.length&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();choose(commands[Math.max(0,Math.min(active,commands.length-1))]);return;}
  if(e.key==='Tab'){
   const all=Array.from(panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled),select:not(:disabled)')??[]);
   if(!all.length)return;
   if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all[all.length-1].focus();}
   if(!e.shiftKey&&document.activeElement===all[all.length-1]){e.preventDefault();all[0].focus();}
  }
 }
 return <section className="ods-command-demo" aria-label="نمونهٔ پالت فرمان‌ها">
  <Card title="پالت فرمان‌های Ocean" description="جست‌وجوی کیبوردی با مجوزهای نمایشی؛ هیچ فرمانی خارج از صفحات ثبت‌شدهٔ Studio اجرا نمی‌شود.">
   <div className="ods-command-controls"><label>محیط مجوز نمونه<select aria-label="محیط مجوزهای نمایشی" value={environment} onChange={e=>setEnvironment(e.target.value as MockEnvironment)}>
    <option value="workspace">فضای کاری</option><option value="organization">مدیریت سازمان</option><option value="platform">مدیریت پلتفرم</option>
   </select></label><Button onClick={activate}><Command size={16}/> بازکردن فرمان‌ها</Button><kbd dir="ltr">Ctrl / ⌘ + K</kbd></div>
   <p className="ods-pattern-hint">می‌توانید همین صفحه را با کلید میانبر باز کنید. دسترسی‌ها ساختگی و مستقل از کاربران واقعی هستند.</p>
  </Card>
  {open&&createPortal(<div className="ods-command-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
   <div ref={panel} className="ods-command-dialog" role="dialog" aria-modal="true" aria-label="فرمان‌های آزمایشی" onKeyDown={keyboard}>
    <div className="ods-command-search"><Search size={18} aria-hidden/><input ref={searchInput} role="combobox" aria-label="جست‌وجوی فرمان‌ها"
      aria-expanded="true" aria-controls="ods-command-options" aria-activedescendant={commands.length?'ods-command-'+commands[Math.min(active,commands.length-1)].id:undefined}
      autoComplete="off" value={query} placeholder="نام فرمان یا صفحه را بنویسید…" onChange={e=>{setQuery(e.target.value);setActive(0);}}/>
     <button type="button" aria-label="بستن پالت فرمان‌ها" onClick={close}><X size={18}/></button></div>
    <div id="ods-command-options" className="ods-command-results" role="listbox" aria-label="فهرست فرمان‌های مجاز">
     {commands.length?commands.map((command,i)=><button id={'ods-command-'+command.id} role="option" aria-selected={i===active} type="button" key={command.id}
      onMouseEnter={()=>setActive(i)} onClick={()=>choose(command)}><strong>{command.label}</strong><span>{command.hint}</span></button>):
      <p role="status" className="ods-command-empty">هیچ فرمان مجازی با این عبارت پیدا نشد.</p>}
     <button type="button" disabled aria-label="فرمان آزمایشی غیرفعال" className="ods-command-disabled">فرمان آزمایشی غیرفعال — قابل اجرا نیست</button>
    </div><p className="ods-command-help">↑ ↓ برای انتخاب · Enter برای اجرا · Esc برای بستن</p>
   </div>
  </div>,document.body)}
 </section>;
}
