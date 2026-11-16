SELECT e.id,e.actor_id,p.display_name,json_extract(e.result,'$.mode'),json_extract(e.result,'$.revision'),e.created_at
FROM local_kitchen_staff_events e JOIN local_principals p ON p.id=e.actor_id JOIN local_principals target ON target.id=json_extract(e.result,'$.employeeId')
WHERE e.ticket_id IS NULL AND target.id=?1 AND target.business_id=?2 AND p.business_id=?2
AND (?3='' OR substr(e.created_at,1,10)>=?3) AND (?4='' OR substr(e.created_at,1,10)<=?4)
AND (?5='' OR e.created_at<?5 OR (e.created_at=?5 AND e.id<?6))
ORDER BY e.created_at DESC,e.id DESC LIMIT ?7
