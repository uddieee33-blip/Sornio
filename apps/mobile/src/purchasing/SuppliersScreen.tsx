/**
 * Supplier foundation (21B-1): list, search/filter, detail, role-aware actions.
 *
 * Every figure rendered here came from the hub and was re-validated by
 * `purchasing-contract` before it reached this file. Nothing is computed.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatInr, parsePaise } from '@sornio/mobile-contracts';
import { space } from '@sornio/mobile-design';
import type { PurchasingRead } from './client';
import type { PurchasingSupplier } from '../../../../packages/business-domain/src/purchasing-contract';
import {
  ActionButton,
  Body,
  Eyebrow,
  Hairline,
  Metric,
  Muted,
  Row,
  SearchField,
  Title,
} from '../components/primitives';
import { EmptyState } from '../components/primitives';
import { ids } from '../testing/identifiers';

/** A payable balance is a signed decimal string of paise; render it, never maths it. */
function balance(value: string): string {
  const paise = parsePaise(value, true);
  return formatInr(paise);
}

function supplierDetail(supplier: PurchasingSupplier): string {
  const parts: string[] = [];
  if (supplier.phone) parts.push(supplier.phone);
  if (supplier.gstin) parts.push(`GSTIN ${supplier.gstin}`);
  parts.push(`${supplier.paymentTermsDays} day terms`);
  return parts.join(' · ');
}

export function SuppliersScreen({
  read,
  onOpenOrder,
  onOpenStatement,
  onSave,
}: {
  read: PurchasingRead;
  onOpenOrder: (supplierId: string) => void;
  onOpenStatement: (supplierId: string) => void;
  onSave: (supplier: PurchasingSupplier | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return read.workspace.suppliers.filter((supplier) => {
      if (showArchived ? false : supplier.archived) return false;
      if (needle === '') return true;
      return (
        supplier.name.toLowerCase().includes(needle) ||
        (supplier.phone ?? '').toLowerCase().includes(needle) ||
        (supplier.gstin ?? '').toLowerCase().includes(needle)
      );
    });
  }, [read.workspace.suppliers, query, showArchived]);

  const supplier = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;
  const orders = supplier
    ? read.workspace.purchaseOrders.filter((order) => order.supplierId === supplier.id)
    : [];
  const invoices = supplier
    ? read.workspace.invoices.filter((invoice) => invoice.supplierId === supplier.id)
    : [];
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.outstandingPaise, 0);

  return (
    <View style={styles.split}>
      <ScrollView style={styles.pane} contentContainerStyle={styles.pad} testID={ids.purchaseSuppliers}>
        <View style={styles.block}>
          <Eyebrow>Suppliers</Eyebrow>
          <SearchField value={query} onChange={setQuery} placeholder="Search name, phone or GSTIN" />
        </View>
        <View style={styles.actions}>
          <ActionButton
            label={showArchived ? 'Hide archived' : 'Show archived'}
            onPress={() => setShowArchived((value) => !value)}
            testID={ids.purchaseSupplierFilter}
          />
          {read.workspace.capabilities.manageSuppliers ? (
            <ActionButton label="Add supplier" onPress={() => onSave(null)} testID={ids.purchaseSupplierAdd} />
          ) : null}
        </View>
        {rows.length === 0 ? (
          <View style={styles.block}>
            <EmptyState
              title="No suppliers match"
              detail={
                showArchived
                  ? 'Clear the search to see every supplier on this hub.'
                  : 'No supplier matches this search in the synchronized copy.'
              }
            />
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.block}>
              <Row
                title={row.name}
                detail={supplierDetail(row)}
                meta={balance(row.balancePaise)}
                onPress={() => setSelectedId(row.id)}
                testID={ids.purchaseSupplierRow(row.id)}
              />
              <Hairline />
            </View>
          ))
        )}
      </ScrollView>

      {supplier ? (
        <ScrollView style={styles.pane} contentContainerStyle={styles.pad} testID={ids.purchaseSupplierDetail}>
          <View style={styles.block}>
            <Title>{supplier.name}</Title>
            <Muted>{supplierDetail(supplier)}</Muted>
            {supplier.archived ? <Muted>Archived — no new orders can be raised.</Muted> : null}
          </View>
          <View style={styles.metrics}>
            <Metric label="Balance" value={balance(supplier.balancePaise)} hint="Owed to this supplier" />
            <Metric label="Overdue" value={balance(supplier.overduePaise)} />
            <Metric label="Open invoices" value={String(invoices.length)} hint={`${formatInr(parsePaise(String(outstanding), false))} unpaid`} />
          </View>
          <View style={styles.actions}>
            {read.workspace.capabilities.managePurchaseOrders && !supplier.archived ? (
              <ActionButton
                label="New purchase order"
                onPress={() => onOpenOrder(supplier.id)}
                testID={ids.purchaseSupplierNewOrder}
              />
            ) : null}
            <ActionButton
              label="Statement"
              onPress={() => onOpenStatement(supplier.id)}
              testID={ids.purchaseSupplierStatement}
            />
            {read.workspace.capabilities.manageSuppliers ? (
              <ActionButton label="Edit supplier" onPress={() => onSave(supplier)} testID={ids.purchaseSupplierEdit} />
            ) : null}
          </View>
          {supplier.notes ? (
            <View style={styles.block}>
              <Eyebrow>Notes</Eyebrow>
              <Body>{supplier.notes}</Body>
            </View>
          ) : null}
          <View style={styles.block}>
            <Eyebrow>Recent orders</Eyebrow>
            {orders.length === 0 ? (
              <Muted>No purchase orders with this supplier yet.</Muted>
            ) : (
              orders.slice(0, 8).map((order) => (
                <Row
                  key={order.id}
                  title={`Order ${order.number}`}
                  detail={`${order.status} · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'}`}
                  meta={formatInr(parsePaise(String(order.totalPaise), false))}
                />
              ))
            )}
          </View>
          {!read.workspace.capabilities.paySuppliers && invoices.length > 0 ? (
            <Muted>Recording payments needs the owner or a manager.</Muted>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  pane: { flex: 1 },
  pad: { paddingHorizontal: space[20], paddingBottom: space[48] },
  block: { paddingTop: space[16], gap: space[8] },
  actions: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  metrics: { paddingTop: space[16], flexDirection: 'row', flexWrap: 'wrap', gap: space[24] },
});
