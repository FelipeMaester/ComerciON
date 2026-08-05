'use client';

import { useRouter } from 'next/navigation';
import { useCart } from '@/lib/hooks';
import { removeFromCart, updateCartQuantity } from '@/lib/cart';

export default function CartPage() {
  const items = useCart();
  const router = useRouter();
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Carrinho</h1>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Seu carrinho está vazio.</p>
      ) : (
        <>
          <table className="mb-6 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2">Produto</th>
                <th className="px-4 py-2">Qtd</th>
                <th className="px-4 py-2">Preço unit.</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.productId} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">
                    <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{item.sku}</span> {item.name}
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      min={1}
                      className="input w-16 px-2 py-1"
                      value={item.quantity}
                      onChange={(e) => updateCartQuantity(item.productId, Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-2">R$ {item.unitPrice.toFixed(2)}</td>
                  <td className="px-4 py-2">R$ {(item.quantity * item.unitPrice).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => removeFromCart(item.productId)} className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400">
                      remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <span className="text-lg font-semibold">Subtotal: R$ {subtotal.toFixed(2)}</span>
            <button onClick={() => router.push('/checkout')} className="btn-primary">
              Finalizar compra
            </button>
          </div>
        </>
      )}
    </div>
  );
}
