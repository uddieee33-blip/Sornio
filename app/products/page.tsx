import { ProductTable } from '@/components/products/product-table';

export default function ProductsPage() {
  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Products & Services</h1>
          <p className="mt-2 text-slate-600">Create, manage, and monitor items that drive revenue and inventory.</p>
        </div>
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add Item</button>
      </div>
      <ProductTable />
    </div>
  );
}
