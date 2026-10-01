const products = [
  { name: 'Bamboo Mug', category: 'Home', sellingPrice: 499, cost: 260, stock: 42, status: 'Active' },
  { name: 'Lemon Tea', category: 'Food', sellingPrice: 120, cost: 48, stock: 98, status: 'Active' },
  { name: 'Website Setup', category: 'Services', sellingPrice: 15000, cost: 6500, stock: 0, status: 'Active' },
  { name: 'Organic Soap', category: 'Personal Care', sellingPrice: 280, cost: 130, stock: 18, status: 'Inactive' },
];

export function ProductTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-700">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Item Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Selling Price</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Margin</th>
              <th className="px-4 py-3 font-medium">Stock</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const margin = ((product.sellingPrice - product.cost) / product.sellingPrice) * 100;
              return (
                <tr key={product.name} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-medium text-slate-900">{product.name}</td>
                  <td className="px-4 py-3">{product.category}</td>
                  <td className="px-4 py-3">₹{product.sellingPrice}</td>
                  <td className="px-4 py-3">₹{product.cost}</td>
                  <td className="px-4 py-3">{margin.toFixed(1)}%</td>
                  <td className="px-4 py-3">{product.stock}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${product.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {product.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
