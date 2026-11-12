import {NearbyHubs} from './NearbyHubs';
import {useEffect,useState} from 'react';
import {Linking,TextInput,View} from 'react-native';
import {ActionButton,Body,Eyebrow,Muted} from '../components/primitives';
import {useTheme} from '../theme/ThemeProvider';
import {createSecureStore} from '../storage/secureStore';
import {hubProfiles,parseHubCard,type HubConnectionCard,type HubProfile} from '../../../../packages/business-domain/src/hub-setup';
export function HubConnectionChooser({busy,onUse}:{busy:boolean;onUse:(details:{origin:string;businessId:string;hubId:string;certificateSha256?:string})=>void}){
 const {palette}=useTheme();const [raw,setRaw]=useState(''),[card,setCard]=useState<HubConnectionCard|null>(null),[profiles,setProfiles]=useState<HubProfile[]>([]),[saving,setSaving]=useState(false),[message,setMessage]=useState('A card or saved shortcut fills connection details only. You must verify the shop over HTTPS afterward.');
 function preview(value:string){try{const next=parseHubCard(value);setRaw(value);setCard(next);setMessage('Review these unverified details against the owner’s desktop before using them.');}catch(e){setCard(null);setMessage(e instanceof Error?e.message:'Connection card could not be read.');}}
 useEffect(()=>{let active=true;void Promise.resolve().then(()=>hubProfiles(createSecureStore(true)).load()).then(p=>{if(active)setProfiles(p);}).catch(()=>{if(active)setMessage('Saved shop shortcuts could not be read. Manual setup remains available.');});
  const receive=(url:string|null|undefined)=>{if(active&&url?.startsWith('sornio://hub-connect'))preview(url);};
  const subscription=Linking.addEventListener('url',event=>receive(event.url));void Linking.getInitialURL().then(receive).catch(()=>{});return()=>{active=false;subscription.remove();};
 },[]);
 async function remove(id:string){if(busy||saving)return;setSaving(true);try{const store=hubProfiles(createSecureStore(true));await store.removeShortcut(id);setProfiles(await store.load());setMessage('Shortcut removed. Device approval, saved drafts and pending submissions were kept.');}catch{setMessage('Shortcut removal could not be confirmed. Saved requests were kept.');}finally{setSaving(false);}}
 const field={minHeight:48,padding:12,color:palette.ink,borderWidth:1,borderColor:palette.line};
 return <View style={{gap:12}}><NearbyHubs busy={busy||saving} profiles={profiles} onUse={onUse}/><Eyebrow>Cards & saved shops</Eyebrow><Muted>{message}</Muted>
 {profiles.map(p=><View key={p.hub.hubId} style={{gap:8,padding:12,borderWidth:1,borderColor:palette.line}}><Body>{`${p.hub.businessName} · ${p.origin}`}</Body><Muted>{`Last identity check: ${new Date(p.verifiedAt).toLocaleString()}. Check again before connecting.`}</Muted><ActionButton label={`Use saved details for ${p.hub.businessName}`} disabled={busy||saving} onPress={()=>onUse({origin:p.origin,businessId:p.hub.businessId,hubId:p.hub.hubId,certificateSha256:p.certificateSha256})}/><ActionButton label="Remove shortcut only" disabled={busy||saving} onPress={()=>void remove(p.hub.hubId)}/></View>)}
 <TextInput accessibilityLabel="Public connection card or Sornio link" placeholder="Paste the public card or connection link from the desktop" multiline maxLength={6000} value={raw} editable={!busy&&!saving} onChangeText={value=>{setRaw(value);setCard(null);}} style={[field,{minHeight:96}]}/><ActionButton label="Preview connection details" disabled={busy||saving||!raw} onPress={()=>preview(raw)}/>
 {card?<View style={{gap:8}}><Body>{`${card.businessName} · ${card.origin}`}</Body><Muted>{`Business ${card.businessId}\nHub ${card.hubId}\nCard expires ${new Date(card.expiresAt).toLocaleString()}. Not yet authenticated.`}</Muted><ActionButton label="Use these details, then verify the shop" disabled={busy||saving} onPress={()=>{try{const current=parseHubCard(raw);onUse(current);setMessage('Details filled. Use Verify shop IDs below; no credentials or orders have been sent.');}catch(e){setCard(null);setMessage(e instanceof Error?e.message:'Request a fresh card.');}}}/></View>:null}
 </View>;
}
