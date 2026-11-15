WITH events AS (
 SELECT 'transition:'||e.operation_id AS id,e.actor_id,t.id AS ticket_id,t.order_id,json_extract(e.request,'$.action.state') AS state,e.created_at,'transition' AS kind,e.request AS detail
 FROM local_restaurant_events e JOIN local_restaurant_tickets t ON t.id=json_extract(e.request,'$.action.id') WHERE json_extract(e.request,'$.action.kind')='set_ticket_state'
 UNION ALL
 SELECT 'assignment:'||e.id,e.actor_id,t.id,t.order_id,NULL,e.created_at,'assignment',e.result
 FROM local_kitchen_staff_events e JOIN local_restaurant_tickets t ON t.id=e.ticket_id
)
SELECT e.id,e.actor_id,p.display_name,e.ticket_id,e.order_id,e.state,e.created_at,e.kind,tb.name,o.kind,o.settled_invoice IS NOT NULL,e.detail
FROM events e JOIN local_restaurant_orders o ON o.id=e.order_id JOIN local_restaurant_tickets t ON t.id=e.ticket_id JOIN local_principals p ON p.id=e.actor_id LEFT JOIN local_restaurant_tables tb ON tb.id=o.table_id LEFT JOIN local_principals target ON target.id=json_extract(e.detail,'$.actorId')
WHERE (?1='' OR instr(lower(e.ticket_id||' '||e.order_id||' '||COALESCE(tb.name,'takeaway')||' '||t.items||' '||p.display_name||' '||COALESCE(target.display_name,'')),lower(?1))>0)
AND (?2='all' OR e.state=?2) AND (?3='' OR substr(e.created_at,1,10)>=?3) AND (?4='' OR substr(e.created_at,1,10)<=?4)
AND (?5='' OR e.created_at<?5 OR (e.created_at=?5 AND e.id<?6))
ORDER BY e.created_at DESC,e.id DESC LIMIT ?7
