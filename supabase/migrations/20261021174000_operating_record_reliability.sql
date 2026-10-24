-- Versioned, complete operating records. Existing relational history is preserved.
-- All changes for one business serialize on its business row; a reset advances
-- its generation so offline snapshots cannot resurrect deleted records.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS operating_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS sync_generation BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS operating_records (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('products','transactions','customers','plans','members','subscriptions','reminderTemplates','invoices','paymentRecords','checkIns','scanEvents','biometricCredentials','appointments','stockMovements','audit','campaigns','settings')),
  record_id TEXT NOT NULL CHECK (length(record_id) BETWEEN 1 AND 160),
  data JSONB NOT NULL CHECK (jsonb_typeof(data)='object'),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id,kind,record_id)
);
ALTER TABLE operating_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read operating records" ON operating_records FOR SELECT TO authenticated
  USING (tenant_role(business_id) IS NOT NULL);
GRANT SELECT ON operating_records TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON operating_records FROM anon, authenticated;

-- Existing data enters the new store under the same stable UUIDs the old adapter used.
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT p.business_id,'products',p.id::text,jsonb_build_object('id',p.id::text,'name',p.name,'category',COALESCE(c.name,p.description,'General'),'itemType',p.item_type,'sellingPrice',p.selling_price,'cost',p.cost_price,'stock',0,'reorderLevel',p.reorder_level,'status',CASE WHEN p.active THEN 'Active' ELSE 'Inactive' END,'taxRate',p.tax_rate,'description',p.description,'sku',p.sku,'unit',p.unit,'barcode',p.barcode,'internalCode',p.internal_code,'looseMode',p.loose_mode,'scaleNumber',p.scale_number)
FROM products p LEFT JOIN categories c ON c.id=p.category_id AND c.business_id=p.business_id
ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'transactions',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'type',type,'description',notes,'amount',amount,'direction',direction,'account',account_type,'paymentMethod',subtype,'date',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD'),'items',items)) FROM transactions ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'customers',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'name',name,'phone',phone,'email',email,'details',notes,'openingBalance',opening_balance,'bank',bank_details,'createdAt',created_at)) FROM customers ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT m.business_id,'stockMovements',m.id::text,jsonb_strip_nulls(jsonb_build_object('id',m.id::text,'productId',m.product_id::text,'productName',p.name,'at',m.created_at,'reason',CASE m.movement_type WHEN 'purchase' THEN 'goods-inward' WHEN 'adjustment' THEN 'count' ELSE m.movement_type END,'delta',m.delta,'balance',m.balance_after,'note',COALESCE(m.notes,''),'reference',m.reference_text,'unit',m.unit)) FROM inventory_movements m JOIN products p ON p.id=m.product_id AND p.business_id=m.business_id ON CONFLICT DO NOTHING;
-- Legacy items without any movement still need a recoverable opening count.
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT p.business_id,'stockMovements','legacy-opening-'||p.id,jsonb_build_object('id','legacy-opening-'||p.id,'productId',p.id::text,'productName',p.name,'at',NOW(),'reason','opening','delta',p.current_stock,'balance',p.current_stock,'note','Opening stock migrated from the previous cloud store')
FROM products p WHERE p.item_type='product' AND p.current_stock<>0 AND NOT EXISTS(SELECT 1 FROM inventory_movements m WHERE m.business_id=p.business_id AND m.product_id=p.id) ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'campaigns',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'name',name,'channel',channel,'spend',spend,'notes',notes,'startDate',start_date)) FROM marketing_campaigns ON CONFLICT DO NOTHING;

-- Backfill older invoice and membership tables if they were populated directly.
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT i.business_id,'invoices',i.id::text,jsonb_strip_nulls(jsonb_build_object('id',i.id::text,'businessId',i.business_id,'customerId',i.customer_id,'customerName',i.customer_name,'customerPhone',i.customer_phone,'createdAt',i.created_at,'dueDate',i.due_date,'paymentMethod',i.payment_method,'paymentStatus',i.payment_status,'receiptMode',i.receipt_mode,'subtotal',i.subtotal,'tax',i.tax,'totalAmount',i.total_amount,'notes',i.notes,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',it.id,'name',it.name,'category',COALESCE(it.category,'General'),'quantity',it.quantity,'unitPrice',it.unit_price,'total',it.total)) FROM invoice_items it WHERE it.business_id=i.business_id AND it.invoice_id=i.id),'[]'::jsonb))) FROM invoices i ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'paymentRecords',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'invoiceId',invoice_id,'customerName',customer_name,'amount',amount,'paymentMethod',payment_method,'status',status,'gateway',gateway,'paymentDate',payment_date)) FROM payment_records ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'plans',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'name',name,'type',type,'durationMonths',duration_months,'price',price,'description',description,'isActive',is_active)) FROM membership_plans ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'members',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'name',name,'phone',COALESCE(phone,''),'email',email,'preferredChannel',preferred_channel,'createdAt',created_at)) FROM members ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'subscriptions',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'businessId',business_id,'memberId',member_id,'planId',plan_id,'startDate',start_date,'expiryDate',expiry_date,'autoRenew',auto_renew,'status',status,'reminderSentAt',reminder_sent_at,'createdAt',created_at)) FROM membership_subscriptions ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'reminderTemplates',id::text,jsonb_build_object('id',id::text,'businessId',business_id,'name',name,'channel',channel,'message',message,'daysBeforeExpiry',days_before_expiry,'isActive',is_active) FROM reminder_templates ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'scanEvents',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'code',code,'symbology',symbology,'source',source,'context',context,'outcome',outcome,'productId',product_id,'productName',product_name,'quantity',quantity,'by',scanned_by,'at',created_at)) FROM scan_events ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT b.business_id,'biometricCredentials',b.id::text,jsonb_strip_nulls(jsonb_build_object('id',b.id::text,'memberId',b.member_id,'memberName',m.name,'credentialId',b.credential_id,'attachment',b.attachment,'label',COALESCE(b.label,'This device'),'useCount',b.use_count,'lastUsedAt',b.last_used_at,'createdAt',b.created_at)) FROM biometric_credentials b JOIN members m ON m.business_id=b.business_id AND m.id=b.member_id ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'audit',id::text,jsonb_strip_nulls(jsonb_build_object('id',id::text,'type',entity_type,'actor',COALESCE(details->>'actor','Recorded user'),'summary',COALESCE(details->>'summary',action),'reference',details->>'reference','createdAt',created_at)) FROM audit_logs ON CONFLICT DO NOTHING;
INSERT INTO operating_records(business_id,kind,record_id,data)
SELECT business_id,'settings','settings',jsonb_build_object('id',id,'businessId',business_id,'receiptMode',receipt_mode,'sendSmsReminders',send_sms_reminders,'sendWhatsappReminders',send_whatsapp_reminders,'autoGenerateInvoiceNumber',auto_generate_invoice_number,'taxRate',tax_rate,'allowMemberships',allow_memberships,'allowInventory',allow_inventory,'allowAppointments',allow_appointments,'allowDigitalReceipts',allow_digital_receipts,'allowPhysicalReceipts',allow_physical_receipts,'activeRole','owner','createdAt',created_at,'updatedAt',updated_at) FROM business_settings ON CONFLICT DO NOTHING;

-- Resolve ownership from the provider, never from a browser business id.
CREATE OR REPLACE FUNCTION operating_business() RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  SELECT business_id INTO b FROM business_members WHERE user_id=auth.uid() ORDER BY created_at,business_id LIMIT 1;
  IF b IS NULL THEN
    b:=gen_random_uuid();
    INSERT INTO businesses(id,name,owner_id,currency) VALUES(b,'My Business',auth.uid(),'INR');
  END IF;
  RETURN b;
END $$;
REVOKE ALL ON FUNCTION operating_business() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION operating_business() TO authenticated;

CREATE OR REPLACE FUNCTION read_operating_snapshot() RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID:=operating_business(); g BIGINT;
BEGIN
  SELECT sync_generation INTO g FROM businesses WHERE id=b FOR SHARE;
  IF tenant_role(b) IS NULL THEN RAISE EXCEPTION 'membership required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('businessId',b,'generation',g,'records',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',kind,'id',record_id,'data',data,'revision',revision) ORDER BY kind,record_id) FROM operating_records WHERE business_id=b),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION read_operating_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION read_operating_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION sync_operating_records(p_generation BIGINT,p_changes JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID:=operating_business(); g BIGINT; role_name TEXT; item JSONB; previous operating_records%ROWTYPE; k TEXT; ident TEXT; value JSONB; expected BIGINT;
BEGIN
  SELECT sync_generation INTO g FROM businesses WHERE id=b FOR UPDATE;
  role_name:=tenant_role(b);
  IF role_name NOT IN ('owner','manager','staff') OR role_name IS NULL THEN RAISE EXCEPTION 'write permission required' USING ERRCODE='42501'; END IF;
  IF g<>p_generation THEN RAISE EXCEPTION 'stale business generation' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>100000 THEN RAISE EXCEPTION 'invalid changes'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    k:=item->>'kind';ident:=item->>'id';value:=item->'data';expected:=(item->>'revision')::bigint;
    IF k NOT IN ('products','transactions','customers','plans','members','subscriptions','reminderTemplates','invoices','paymentRecords','checkIns','scanEvents','biometricCredentials','appointments','stockMovements','audit','campaigns','settings') OR ident IS NULL OR length(ident) NOT BETWEEN 1 AND 160 OR jsonb_typeof(value)<>'object' OR expected IS NULL OR expected<0 THEN RAISE EXCEPTION 'invalid record'; END IF;
    IF k<>'settings' AND value->>'id' IS DISTINCT FROM ident THEN RAISE EXCEPTION 'record id mismatch'; END IF;
    IF k='settings' AND ident<>'settings' THEN RAISE EXCEPTION 'invalid settings key'; END IF;
    IF role_name='staff' AND k IN ('products','plans','reminderTemplates','campaigns','settings') THEN RAISE EXCEPTION 'manager permission required' USING ERRCODE='42501'; END IF;
    IF k='transactions' AND (jsonb_typeof(value->'amount') IS DISTINCT FROM 'number' OR (value->>'amount')::numeric<0 OR abs((value->>'amount')::numeric)>90000000000 OR value->>'direction' NOT IN ('in','out') OR value->>'type' NOT IN ('sale','expense','payment','stock_adjustment','refund','transfer') OR value->>'account' NOT IN ('cash','bank','upi','card','receivables','payables','revenue','expense','inventory','tax')) THEN RAISE EXCEPTION 'invalid transaction'; END IF;
    IF k='stockMovements' AND (jsonb_typeof(value->'delta') IS DISTINCT FROM 'number' OR value->>'productId' IS NULL) THEN RAISE EXCEPTION 'invalid stock movement'; END IF;
    IF k='paymentRecords' AND (jsonb_typeof(value->'amount') IS DISTINCT FROM 'number' OR (value->>'amount')::numeric<=0) THEN RAISE EXCEPTION 'invalid payment'; END IF;
    SELECT * INTO previous FROM operating_records WHERE business_id=b AND kind=k AND record_id=ident;
    IF FOUND THEN
      IF previous.data=value THEN CONTINUE; END IF;
      IF k IN ('transactions','stockMovements','paymentRecords','scanEvents','audit') THEN RAISE EXCEPTION 'ledger is append only' USING ERRCODE='40001'; END IF;
      IF previous.revision<>expected THEN RAISE EXCEPTION 'concurrent edit' USING ERRCODE='40001'; END IF;
      UPDATE operating_records SET data=value,revision=revision+1,updated_at=NOW() WHERE business_id=b AND kind=k AND record_id=ident;
    ELSE
      IF expected<>0 THEN RAISE EXCEPTION 'missing prior revision' USING ERRCODE='40001'; END IF;
      INSERT INTO operating_records(business_id,kind,record_id,data,created_by) VALUES(b,k,ident,value,auth.uid());
    END IF;
  END LOOP;
  -- All referenced products must belong to this same tenant's record set.
  IF EXISTS(SELECT 1 FROM operating_records m WHERE m.business_id=b AND m.kind='stockMovements' AND NOT EXISTS(SELECT 1 FROM operating_records p WHERE p.business_id=b AND p.kind='products' AND p.record_id=m.data->>'productId')) THEN RAISE EXCEPTION 'unknown stock item'; END IF;
  -- Serialize competing sales against the combined stock ledger, including
  -- movements uploaded by another device since this device last pulled.
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(p_changes) x
    WHERE x->>'kind'='stockMovements' AND x->'data'->>'reason'='sale'
    AND (x->'data'->>'delta')::numeric<0
    AND (SELECT COALESCE(SUM((m.data->>'delta')::numeric),0) FROM operating_records m
      WHERE m.business_id=b AND m.kind='stockMovements'
      AND m.data->>'productId'=x->'data'->>'productId')<-0.0005
  ) THEN RAISE EXCEPTION 'sale exceeds available stock' USING ERRCODE='40001'; END IF;
  -- Concurrent collections may not overdraw a customer's account.
  IF EXISTS(
    SELECT 1 FROM operating_records c WHERE c.business_id=b AND c.kind='customers'
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_changes) x WHERE x->>'kind'='transactions' AND x->'data'->>'customerId'=c.record_id AND x->'data'->>'account'='receivables' AND x->'data'->>'direction'='out')
    AND COALESCE((c.data->>'openingBalance')::numeric,0)+COALESCE((SELECT SUM(CASE WHEN t.data->>'direction'='in' THEN 1 ELSE -1 END*(t.data->>'amount')::numeric) FROM operating_records t WHERE t.business_id=b AND t.kind='transactions' AND t.data->>'account'='receivables' AND t.data->>'customerId'=c.record_id),0)<-0.005
  ) THEN RAISE EXCEPTION 'customer collection exceeds dues' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT 1 FROM operating_records i WHERE i.business_id=b AND i.kind='invoices' AND (SELECT COALESCE(SUM((p.data->>'amount')::numeric),0) FROM operating_records p WHERE p.business_id=b AND p.kind='paymentRecords' AND p.data->>'invoiceId'=i.record_id AND p.data->>'status' IN ('paid','partial'))>(i.data->>'totalAmount')::numeric+0.005) THEN RAISE EXCEPTION 'invoice overpaid' USING ERRCODE='40001'; END IF;
  UPDATE businesses SET operating_sync_enabled=TRUE WHERE id=b;
  RETURN read_operating_snapshot();
END $$;
REVOKE ALL ON FUNCTION sync_operating_records(BIGINT,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sync_operating_records(BIGINT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION reset_operating_records(p_generation BIGINT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b UUID:=operating_business(); g BIGINT;
BEGIN
 SELECT sync_generation INTO g FROM businesses WHERE id=b FOR UPDATE;
 IF tenant_role(b) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501'; END IF;
 IF p_generation<>g THEN RAISE EXCEPTION 'stale reset' USING ERRCODE='40001'; END IF;
 DELETE FROM operating_records WHERE business_id=b AND kind<>'audit';
 DELETE FROM payment_records WHERE business_id=b;
 DELETE FROM invoice_items WHERE business_id=b;
 DELETE FROM invoices WHERE business_id=b;
 DELETE FROM membership_subscriptions WHERE business_id=b;
 DELETE FROM biometric_credentials WHERE business_id=b;
 DELETE FROM members WHERE business_id=b;
 DELETE FROM membership_plans WHERE business_id=b;
 DELETE FROM reminder_templates WHERE business_id=b;
 DELETE FROM expenses WHERE business_id=b;
 PERFORM reset_tenant_data(b);
 UPDATE businesses SET sync_generation=g+1 WHERE id=b;
 RETURN read_operating_snapshot();
END $$;
REVOKE ALL ON FUNCTION reset_operating_records(BIGINT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION reset_operating_records(BIGINT) TO authenticated;

-- Consume the invitation and insert the member under the same row lock/transaction.
CREATE OR REPLACE FUNCTION redeem_team_invite(p_hash TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE invite team_invites%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 SELECT * INTO invite FROM team_invites WHERE code_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR invite.used_at IS NOT NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=NOW() THEN RAISE EXCEPTION 'invalid invitation'; END IF;
 IF EXISTS(SELECT 1 FROM business_members WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'account already belongs to a business'; END IF;
 INSERT INTO business_members(business_id,user_id,role) VALUES(invite.business_id,auth.uid(),invite.role);
 UPDATE team_invites SET used_at=NOW(),used_by=auth.uid() WHERE id=invite.id;
 INSERT INTO audit_logs(business_id,actor_user_id,entity_type,action,details) VALUES(invite.business_id,auth.uid(),'team','team.member.joined',jsonb_build_object('role',invite.role));
 RETURN jsonb_build_object('businessId',invite.business_id,'role',invite.role,'businessName',(SELECT name FROM businesses WHERE id=invite.business_id));
END $$;
-- Kept only for compatibility with staging databases that installed the early
-- reliability draft. Invitations now use the server-only atomic team RPC.
REVOKE ALL ON FUNCTION redeem_team_invite(TEXT) FROM PUBLIC,anon,authenticated;

-- Once a business upgrades, old snapshot APIs must not keep writing a parallel ledger.

ALTER FUNCTION sync_tenant_snapshot(UUID,JSONB) RENAME TO legacy_sync_tenant_snapshot;
REVOKE ALL ON FUNCTION legacy_sync_tenant_snapshot(UUID,JSONB) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION sync_tenant_snapshot(p_business_id UUID,p_snapshot JSONB) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF tenant_role(p_business_id) IS NULL THEN RAISE EXCEPTION 'membership required' USING ERRCODE='42501'; END IF;
 IF (SELECT operating_sync_enabled FROM businesses WHERE id=p_business_id) THEN RAISE EXCEPTION 'refresh the app before syncing' USING ERRCODE='40001'; END IF;
 RETURN legacy_sync_tenant_snapshot(p_business_id,p_snapshot);
END $$;
REVOKE ALL ON FUNCTION sync_tenant_snapshot(UUID,JSONB) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION sync_tenant_snapshot(UUID,JSONB) TO authenticated;
