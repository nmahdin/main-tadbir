const r=e=>{if(!e)return"";try{const n=new Date(e);return isNaN(n.getTime())?e:new Intl.DateTimeFormat("fa-IR",{year:"numeric",month:"long",day:"numeric"}).format(n)}catch{return e}};export{r as f};
