import type {EnvironmentsPayload,EnvironmentDescriptor} from '../../shared/lib/environments';
import type {OwnerScope} from './commercialApi';
export type Access={area:'purchase';scope:OwnerScope;label:string}|{area:'platform';label:string}|{area:'forbidden';reason:string};
export function billingAccess(current:EnvironmentDescriptor|null,payload:EnvironmentsPayload|null):Access{
 if(!current||!payload)return {area:'forbidden',reason:'ابتدا محیط معتبر خود را انتخاب کنید.'};
 if(current.kind==='platform'){
  return payload.platform.eligible&&payload.platform.permissions.includes('platform.billing.manage')
   ?{area:'platform',label:'مدیریت مالی پلتفرم'}:{area:'forbidden',reason:'مجوز platform.billing.manage موجود نیست.'};
 }
 if(current.kind==='organization'){
  const org=payload.organizations.find(x=>x.id===current.id);
  return org&&org.status==='active'&&org.permissions.includes('organization.billing.manage')
   ?{area:'purchase',scope:{kind:'organization',organizationId:org.id},label:'خرید سازمان '+org.name}
   :{area:'forbidden',reason:'برای این خرید سازمان فعال و organization.billing.manage لازم است.'};
 }
 if(current.id!==null){
  const ws=payload.workspaces.find(x=>x.id===current.id);
  if(ws&&ws.organization_id!==null)return {area:'forbidden',reason:'خرید سازمانی را از محیط مدیریت سازمان انجام دهید.'};
 }
 return {area:'purchase',scope:{kind:'personal'},label:'اشتراک شخصی'};
}
