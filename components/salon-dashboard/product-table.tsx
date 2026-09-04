"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { ProductRow } from "./types";
import { formatCurrency } from "./types";
import { ClearableNumberInput } from "../ui/ClearableNumberInput";

interface ProductTableProps {
  rows: ProductRow[];
  onRowsChange: (rows: ProductRow[]) => void;
  productOptions?: { id?: string; name: string; price: number }[];
  disabled?: boolean;
}

export function ProductTable({
  rows,
  onRowsChange,
  productOptions = [],
  disabled = false,
}: ProductTableProps) {
  const [showModal, setShowModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateRow = (id: number, patch: Partial<ProductRow>) => {
    onRowsChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const selectProduct = (prod: { id?: string; name: string; price: number }) => {
    onRowsChange([
      ...rows,
      {
        id: Math.max(0, ...rows.map((row) => row.id)) + 1,
        productId: prod.id || "",
        product: prod.name,
        price: prod.price,
        quantity: 1,
        discount: 0,
      },
    ]);
    setShowModal(false);
  };

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#292D29]">Retail Products</h2>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowModal(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] px-3.5 text-xs font-bold text-[#2F352F] transition hover:bg-[#6F776D] hover:text-[#FFFFFF] hover:border-[#6F776D] disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <Plus size={15} />
          Add Product
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF]">
        <table className="w-full min-w-[700px] table-fixed border-collapse text-left text-sm text-[#292D29]">
          <thead className="bg-[#F7F7F4] text-[11px] uppercase tracking-[0.18em] text-[#747A72] border-b border-[#E0E4DD]">
            <tr>
              <th className="px-3 py-3 font-bold">Product</th>
              <th className="px-2 py-3 font-bold w-[130px]"></th>
              <th className="px-2 py-3 font-bold w-[160px]">Quantity</th>
              <th className="px-2 py-3 font-bold w-[90px]">Price</th>
              <th className="px-2 py-3 font-bold w-[90px]">Discount</th>
              <th className="px-2 py-3 font-bold w-[90px]">Amount</th>
              <th className="px-2 py-3 font-bold w-[50px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E0E4DD]">
            {rows.map((row) => (
              <tr key={row.id} className="bg-transparent transition hover:bg-[#F7F7F4]">
                <td className="px-3 py-2 font-bold text-[#292D29] truncate text-xs" title={row.product}>
                  {row.product}
                </td>
                <td className="px-2 py-2 w-[130px]" />
                <td className="px-2 py-2 w-[160px]">
                  <div className="h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 flex items-center transition focus-within:border-[#6F776D]">
                    <ClearableNumberInput
                      min="1"
                      placeholder="1"
                      disabled={disabled || row.isCreditSettle}
                      value={row.quantity}
                      onChange={(val) => updateRow(row.id, { quantity: val })}
                      className="text-[#292D29] text-xs font-semibold disabled:text-[#747A72]"
                    />
                  </div>
                </td>
                <td className="px-2 py-2 w-[90px]">
                  <div className="h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 flex items-center transition focus-within:border-[#6F776D]">
                    <ClearableNumberInput
                      min="0"
                      disabled={disabled || row.isCreditSettle}
                      value={row.price}
                      onChange={(val) => updateRow(row.id, { price: val })}
                      className="text-[#292D29] text-xs font-semibold disabled:text-[#747A72]"
                    />
                  </div>
                </td>
                <td className="px-2 py-2 w-[90px]">
                  <div className="h-9 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-2 flex items-center transition focus-within:border-[#6F776D]">
                    <ClearableNumberInput
                      min="0"
                      disabled={disabled || row.isCreditSettle}
                      value={row.discount}
                      onChange={(val) => updateRow(row.id, { discount: val })}
                      className="text-[#292D29] text-xs font-semibold disabled:text-[#747A72]"
                    />
                  </div>
                </td>
                <td className="px-2 py-2 font-bold text-[#292D29] text-xs w-[90px]">
                  {formatCurrency(Math.max((Number(row.price) || 0) * (Number(row.quantity) || 1) - (Number(row.discount) || 0), 0))}
                </td>
                <td className="px-2 py-2 text-right w-[50px]">
                  <button
                    aria-label="Delete product"
                    type="button"
                    disabled={disabled}
                    onClick={() => onRowsChange(rows.filter((item) => item.id !== row.id))}
                    className="grid size-8 place-items-center rounded-lg border border-[#FBEBEB] text-[#B55B5B] bg-[#FBEBEB] transition hover:bg-[#B55B5B] hover:text-[#FFFFFF] disabled:opacity-50 disabled:pointer-events-none mx-auto cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Select Product Modal Overlay */}
      {showModal && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-2xl text-[#292D29] flex flex-col max-h-[85vh]">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#292D29] transition"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-bold text-[#292D29] mb-4">Select Retail Product</h2>

            <div className="flex-1 overflow-y-auto pr-1">
              {productOptions.length === 0 ? (
                <p className="text-sm text-[#747A72] italic text-center py-8">No retail products in catalog.</p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                  {productOptions.map((prod) => (
                    <div
                      key={prod.name}
                      onClick={() => selectProduct(prod)}
                      className="cursor-pointer rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-[#6F776D] hover:bg-[#E8ECE5]"
                    >
                      <h3 className="text-xs font-bold text-[#292D29] truncate" title={prod.name}>
                        {prod.name}
                      </h3>
                      <p className="mt-1 text-xs font-bold text-[#6F776D]">
                        {formatCurrency(prod.price)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}