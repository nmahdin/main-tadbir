/** Treat origin links as untrusted metadata: only known local SPA destinations are navigable. */
export const safeInternalActionPath=(value:string|null):string|null=>{
 if(!value||!value.startsWith('/')||value.startsWith('//')||value.includes('\\')||/[\u0000-\u001f]/.test(value))return null;
 const path=value.split(/[?#]/,1)[0];
 if(!/^\/[a-z0-9/_-]+$/i.test(path)||path.includes('..'))return null;
 const roots=['/dashboard','/projects','/tasks','/contents','/billing','/settings','/invitations','/support','/shared-services'];
 return roots.some(root=>path===root||path.startsWith(root+'/'))?value:null;
};
