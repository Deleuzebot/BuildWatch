import type{Rpc}from'./handler';
import type{RuntimeConfig}from'./auth';
/** Event/request-triggered delivery only. No timer or scheduled job is registered. */
export async function deliverPush(rpc:Rpc,config:RuntimeConfig){
 if(config.PUSH_DELIVERY_ENABLED!=='true')return;
 const rows=await rpc('buildwatch_delivery',{action:'claim',input:{}}),headers={'Content-Type':'application/json',...(config.EXPO_ACCESS_TOKEN?{Authorization:'Bearer '+config.EXPO_ACCESS_TOKEN}:{})};
 for(const row of rows){const input={notificationId:row.notification_id,token:row.token};
  if(row.ticket){
   try{const response=await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers,body:JSON.stringify({ids:[row.ticket]}),signal:AbortSignal.timeout(10000)});if(!response.ok)continue;const data=await response.json(),receipt=data.data?.[row.ticket];await rpc('buildwatch_delivery',{action:'receipt',input:{...input,status:receipt?.status,pending:!receipt,unregistered:receipt?.details?.error==='DeviceNotRegistered'}});}catch{ /* A receipt lookup can be retried without resending the notification. */ }
  }else{
   try{const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers,body:JSON.stringify({to:row.token,title:row.title,body:row.body,data:{projectId:row.project_id},sound:'default'}),signal:AbortSignal.timeout(10000)});
    if(!response.ok){await rpc('buildwatch_delivery',{action:'failure',input});continue;}
    const data=await response.json();if(data.data?.status==='ok')await rpc('buildwatch_delivery',{action:'ticket',input:{...input,ticket:data.data.id}});else await rpc('buildwatch_delivery',{action:'receipt',input:{...input,status:'error',unregistered:data.data?.details?.error==='DeviceNotRegistered'}});
   }catch{await rpc('buildwatch_delivery',{action:'failure',input:{...input,uncertain:true}}).catch(()=>{});}
  }
 }
}
