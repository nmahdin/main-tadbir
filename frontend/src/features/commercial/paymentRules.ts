/** Deliberate opt-in; never allow a production PSP redirect based on a URL alone. */
export function sandboxPaymentAllowed(amount:number,sandboxFlag:boolean):boolean{
 return amount===0||sandboxFlag;
}
export function sandboxRedirectAllowed(provider:string,url:string|null,sandboxFlag:boolean):string|null{
 if(!sandboxFlag||provider!=='sandbox'||!url)return null;
 try{const u=new URL(url);return u.protocol==='https:'?u.href:null;}catch{return null;}
}
