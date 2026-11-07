import React,{useEffect,useLayoutEffect,useReducer,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,RotateCcw,SkipForward,Sparkles,X} from 'lucide-react';
import {OceanShellPlayground} from './OceanShellPlayground';
import {LAB_ENVS,LAB_WIDTHS,type LabEnvironment,type LabDevice} from './shellState';
import {TOUR_MANIFESTS,tourReducer,validateTourManifest,missingTarget,type TourManifest,type TourStep,type TourState,type TourAction} from './tourModel';

function useTour(manifest:TourManifest){
 const [state,dispatch]=useReducer(tourReducer,{phase:'idle',index:0,version:manifest.version});
 useEffect(()=>{dispatch({type:'RESET',version:manifest.version});},[manifest]);
 return {state,dispatch};
}
type SpotlightRect={top:number;left:number;width:number;height:number};
export function TourSpotlight({rect}:{rect:SpotlightRect|null}){
 return rect&&<div className="odl-tour-spot" aria-hidden="true" style={rect}/>;
}
export function TourStepPopover({step,state,total,missing,onAction}:{step?:TourStep;state:TourState;total:number;missing:boolean;onAction:(action:TourAction)=>void}){
 const popup=useRef<HTMLDivElement>(null);
 useEffect(()=>{popup.current?.focus();},[state.phase,state.index]);
 const inStep=state.phase==='active';
 return <div ref={popup} tabIndex={-1} role="dialog" aria-modal="true"
  aria-label="راهنمای گام‌به‌گام آزمایشی" className="odl-tour-panel" onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();onAction({type:'SKIP'});}
   if(event.key==='Tab'){
    const elements=Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
    if(!elements.length)return;
    if(event.shiftKey&&document.activeElement===elements[0]){event.preventDefault();elements[elements.length-1].focus();}
    else if(!event.shiftKey&&document.activeElement===elements[elements.length-1]){event.preventDefault();elements[0].focus();}
   }
  }}>
  <span className="odl-tour-kicker"><Sparkles size={15}/> نمونهٔ راهنمای تدبیر</span>
  <button className="odl-tour-close" onClick={()=>onAction({type:'CLOSE'})} aria-label="بستن راهنما"><X size={18}/></button>
  <h3>{inStep?step?.title:state.phase==='welcome'?'به تور آزمایشی خوش آمدید':state.phase==='finished'?'تور نمونه پایان یافت':'تور نمونه رد شد'}</h3>
  <p>{inStep?step?.description:state.phase==='welcome'?'در چهار گام با ناوبری، کارت‌های داشبورد، اعلان‌ها و پروفایل نمونه آشنا می‌شوید. هر زمان می‌توانید رد کنید.':'هیچ وضعیت کاربری ذخیره نشده است. از همین صفحه می‌توانید تور را دوباره اجرا کنید.'}</p>
  {inStep&&missing&&<p role="status" className="odl-tour-missing">هدف این گام در قاب فعلی قابل مشاهده نیست. می‌توانید به گام بعد بروید.</p>}
  {inStep&&<span className="odl-tour-progress">گام {state.index+1} از {total}</span>}
  <div className="odl-tour-buttons">
   {state.phase==='welcome'&&<><button onClick={()=>onAction({type:'SKIP'})}>رد کردن</button><button className="odl-tour-primary" onClick={()=>onAction({type:'START'})}>شروع تور <ChevronLeft size={16}/></button></>}
   {inStep&&<><button onClick={()=>onAction({type:'SKIP'})}><SkipForward size={14}/> رد کردن</button>
    <button disabled={state.index===0} onClick={()=>onAction({type:'BACK'})}><ChevronRight size={14}/> قبلی</button>
    <button className="odl-tour-primary" onClick={()=>onAction({type:'NEXT',total})}>{state.index===total-1?'پایان':'بعدی'}<ChevronLeft size={14}/></button></>}
   {(state.phase==='finished'||state.phase==='skipped')&&<><button onClick={()=>onAction({type:'CLOSE'})}>بستن</button><button className="odl-tour-primary" onClick={()=>onAction({type:'REPLAY'})}><RotateCcw size={15}/> پخش دوباره</button></>}
  </div>
 </div>;
}
export function GuidedTourPrototype(){
 const [environment,setEnvironment]=useState<LabEnvironment>('workspace');
 const [width,setWidth]=useState<LabDevice>(834);
 const manifest=TOUR_MANIFESTS[environment];
 const valid=validateTourManifest(manifest);
 const {state,dispatch}=useTour(manifest);
 const [spot,setSpot]=useState<SpotlightRect|null>(null);
 const [missing,setMissing]=useState(false);
 const stage=useRef<HTMLDivElement>(null),launcher=useRef<HTMLButtonElement>(null);
 const lastPhase=useRef(state.phase);
 const step=manifest.steps[state.index];
 useEffect(()=>{
  if(state.phase==='idle'&&lastPhase.current!=='idle')launcher.current?.focus();
  lastPhase.current=state.phase;
 },[state.phase]);
 useLayoutEffect(()=>{
  if(state.phase!=='active'||!step||!stage.current){setSpot(null);setMissing(false);return;}
  function measure(){
   const node=stage.current;
   const target=node?.querySelector<HTMLElement>('[data-tour-id="'+step.targetId+'"]');
   const stageRect=node?.getBoundingClientRect(),rect=target?.getBoundingClientRect();
   if(!stageRect||!rect||rect.width<1||rect.height<1||rect.right<=stageRect.left||rect.left>=stageRect.right||
     rect.bottom<=stageRect.top||rect.top>=stageRect.bottom){
     setSpot(null);setMissing(true);return;
   }
   setMissing(false);setSpot({top:Math.max(0,rect.top-stageRect.top-4),left:Math.max(0,rect.left-stageRect.left-4),
    width:Math.min(rect.width+8,stageRect.width),height:Math.min(rect.height+8,stageRect.height)});
  }
  measure();window.addEventListener('resize',measure);
  const node=stage.current;node?.addEventListener('scroll',measure,true);
  return ()=>{window.removeEventListener('resize',measure);node?.removeEventListener('scroll',measure,true);};
 },[environment,width,state.phase,state.index,step]);
 const active=state.phase!=='idle';
 const visibleIds=typeof document==='undefined'?[]:Array.from(stage.current?.querySelectorAll<HTMLElement>('[data-tour-id]')??[])
  .filter(el=>el.getClientRects().length).map(el=>el.dataset.tourId??'');
 return <section className="odl-tour-prototype" aria-label="تور معرفی نمایشی">
  <div className="odl-controls">
   <label>محیط تور<select aria-label="محیط تور" value={environment} onChange={e=>setEnvironment(e.target.value as LabEnvironment)} disabled={active}>
    {LAB_ENVS.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
   <div role="group" aria-label="عرض تور" className="odl-width-controls">
    {LAB_WIDTHS.map(value=><button key={value} aria-pressed={width===value} disabled={active} onClick={()=>setWidth(value)}>{value}px</button>)}
   </div><button ref={launcher} className="odl-tour-launch" onClick={()=>dispatch({type:'WELCOME'})} disabled={!valid||active}>شروع راهنما</button>
   <span className="odl-fine-print">نسخه {manifest.version} · فقط حافظهٔ موقت</span>
  </div>
  {!valid&&<p role="alert">تعریف تور معتبر نیست؛ اجرا غیرفعال شد.</p>}
  <div ref={stage} className="odl-tour-stage">
   <OceanShellPlayground key={environment+'-'+width} initialEnv={environment} initialWidth={width} hideControls/>
   {active&&<div className="odl-tour-layer">
    <TourSpotlight rect={state.phase==='active'&&!missingTarget(visibleIds,step.targetId)?spot:null}/>
    <TourStepPopover key={state.phase+'-'+state.index} state={state} step={step} total={manifest.steps.length}
     missing={missing} onAction={dispatch}/>
   </div>}
  </div>
 </section>;
}
