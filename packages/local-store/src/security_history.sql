-- Public read model: never project requests, credential hashes, tokens or audit details.
WITH events AS (
 SELECT a.sequence,a.actor_id,p.display_name AS actor_name,a.actor_role,a.action,
 CASE WHEN a.action='staff.session_signout' AND json_extract(o.request,'$.targetActorId') IS NOT NULL THEN json_extract(o.request,'$.targetActorId') ELSE COALESCE(a.target,'') END AS target_id,
 CASE WHEN a.action='staff.session_signout' THEN CASE WHEN o.id IS NOT NULL THEN 'employee' ELSE 'operation' END ELSE 'device' END AS target_kind,
 CASE WHEN a.action='staff.session_signout' THEN t.display_name ELSE d.name END AS target_name,
 CASE WHEN a.action='staff.session_signout' THEN a.target ELSE NULL END AS operation_id,
 CASE WHEN json_extract(o.result,'$.status')='refused' THEN 'refused'
 WHEN json_extract(o.result,'$.status')='accepted' AND json_extract(o.result,'$.outcome') IN ('signed_out','already_inactive') THEN json_extract(o.result,'$.outcome') ELSE NULL END AS outcome,
 a.created_at
 FROM local_identity_audit a
 LEFT JOIN local_principals p ON p.id=a.actor_id AND p.business_id=a.business_id
 LEFT JOIN local_kitchen_assignment_ops o ON a.action='staff.session_signout' AND o.id=a.target AND o.actor_id=a.actor_id AND json_extract(o.request,'$.businessId')=a.business_id AND json_extract(o.request,'$.sessionHandle') IS NOT NULL
 LEFT JOIN local_principals t ON t.id=json_extract(o.request,'$.targetActorId') AND t.business_id=a.business_id
 LEFT JOIN local_hub_devices d ON a.action IN ('hub.device_approved','hub.device_revoked') AND d.id=a.target
 WHERE a.business_id=?1 AND a.workspace_id=?2
 AND a.action IN ('staff.session_signout','hub.device_approved','hub.device_revoked')
 AND (?3='' OR a.action=?3) AND (?4='' OR a.actor_id=?4)
 AND (?5='' OR substr(a.created_at,1,10)>=?5) AND (?6='' OR substr(a.created_at,1,10)<=?6)
 AND (?7 IS NULL OR a.sequence<?7)
)
SELECT sequence,actor_id,actor_name,actor_role,action,target_id,target_kind,target_name,operation_id,outcome,created_at FROM events
WHERE ?8='' OR instr(lower(COALESCE(actor_id,'')||' '||COALESCE(actor_name,'')||' '||target_id||' '||COALESCE(target_name,'')||' '||COALESCE(operation_id,'')),lower(?8))>0
ORDER BY sequence DESC LIMIT ?9
