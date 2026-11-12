const {withAndroidManifest,withDangerousMod}=require('expo/config-plugins');
const fs=require('node:fs');const path=require('node:path');
module.exports=function(config){
 config=withAndroidManifest(config,c=>{const manifest=c.modResults.manifest;manifest['uses-permission']=manifest['uses-permission']||[];if(!manifest['uses-permission'].some(p=>p.$['android:name']==='android.permission.ACCESS_LOCAL_NETWORK'))manifest['uses-permission'].push({$:{'android:name':'android.permission.ACCESS_LOCAL_NETWORK'}});const app=manifest.application[0].$;app['android:networkSecurityConfig']='@xml/sornio_lan_security';app['android:usesCleartextTraffic']='false';return c;});
 return withDangerousMod(config,['android',async c=>{const dir=path.join(c.modRequest.platformProjectRoot,'app/src/main/res/xml');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'sornio_lan_security.xml'),'<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system"/><certificates src="user"/></trust-anchors></base-config></network-security-config>');return c;}]);
};
