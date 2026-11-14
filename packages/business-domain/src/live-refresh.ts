export type RefreshClock={schedule:(action:()=>void,ms:number)=>unknown;cancel:(handle:unknown)=>void};
/** Foreground refresh with one in-flight poll, stale-response guards and bounded
 * backoff. The caller decides whether a previously authorised operation resumes. */
export function liveRefresh(options:{poll:(current:()=>boolean)=>Promise<void>;eligible?:()=>boolean;onError?:(error:unknown)=>void;intervalMs?:number},clock:RefreshClock={schedule:(f,ms)=>setTimeout(f,ms),cancel:h=>clearTimeout(h as ReturnType<typeof setTimeout>)} ){
 let active=false,epoch=0,busy=false,restart=false,timer:unknown=null,failures=0;
 const interval=Math.max(1000,options.intervalMs??5000);
 function cancel(){if(timer!==null){clock.cancel(timer);timer=null;}}
 function schedule(delay:number){cancel();timer=clock.schedule(()=>{timer=null;void tick(epoch);},delay);}
 async function tick(token:number){if(!active||token!==epoch||busy)return;if(options.eligible&&!options.eligible()){schedule(500);return;}busy=true;let delay=interval;
  const current=()=>active&&token===epoch;
  try{await options.poll(current);if(current())failures=0;}
  catch(error){if(current()){failures=Math.min(failures+1,5);delay=Math.min(30000,interval*2**failures);options.onError?.(error);}}
  finally{busy=false;if(active){if(restart){restart=false;void tick(epoch);}else if(current())schedule(delay);}}
 }
 return {start(){active=true;epoch++;cancel();if(busy)restart=true;else void tick(epoch);},stop(){active=false;epoch++;restart=false;cancel();},refresh(){if(active){epoch++;cancel();if(busy)restart=true;else void tick(epoch);}}};
}
