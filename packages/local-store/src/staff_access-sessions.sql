SELECT d.id,d.name,min(h.expires,d.expires),d.last_seen,khandle.handle FROM local_hub_sessions h
LEFT JOIN local_hub_session_handles khandle ON khandle.token_hash=h.token_hash
JOIN local_hub_devices d ON d.id=h.device_id JOIN local_principals p ON p.id=h.actor_id LEFT JOIN local_kitchen_staff k ON k.actor_id=p.id
WHERE p.id=?1 AND p.business_id=?2 AND p.enabled=1 AND h.actor_revision=p.revision
AND COALESCE(k.mode,'')<>'revoked' AND h.expires>strftime('%s','now') AND d.expires>strftime('%s','now') AND d.state='approved'
AND d.actor_id=h.actor_id AND d.revision=h.device_revision AND d.generation=h.generation
AND h.generation=(SELECT generation FROM local_recovery_identity WHERE singleton=1)
ORDER BY d.name,d.id LIMIT 100
