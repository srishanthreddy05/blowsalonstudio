"use client";

import { useState } from "react";
import * as productsService from "@/services/products";
import { useAppData } from "@/context/AppDataContext";
import type { Product } from "@/types/product";
import { Plus, Search, Edit2, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/components/salon-dashboard/types";

export default function ProductsPage() {
  const { products, refreshProducts, loadingAppData } = useAppData();
  const loading = loadingAppData;
  const [searchQuery, setSearchQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    quantity: 0,
    lowStockThreshold: 5,
    description: "",
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormData({
      name: "",
      price: 0,
      quantity: 0,
      lowStockThreshold: 5,
      description: "",
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      price: product.price || 0,
      quantity: product.quantity || 0,
      lowStockThreshold: product.lowStockThreshold ?? 5,
      description: product.description || "",
    });
    setModalOpen(true);
  };

  const handleDeleteTrigger = (id: string) => {
    setIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!idToDelete) return;
    try {
      await productsService.delete(idToDelete);
      setDeleteConfirmOpen(false);
      setIdToDelete(null);
      await refreshProducts();
    } catch (error) {
      console.error("Failed to delete product:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
    const desc = formData.description.trim();
    const payload: Omit<Product, "id"> = {
      name: formData.name.trim(),
      price: Number(formData.price) || 0,
      quantity: Number(formData.quantity) || 0,
      lowStockThreshold: Number(formData.lowStockThreshold) || 5,
      isActive: true,
    };
    if (desc) {
      payload.description = desc;
    }

    if (editingProduct?.id) {
      await productsService.update(editingProduct.id, payload);
    } else {
      await productsService.create(payload);
    }
      setModalOpen(false);
      await refreshProducts();
    } catch (error) {
      console.error("Failed to save product:", error);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="w-full text-[#292D29] space-y-8">
      {/* Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Retail Inventory
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Retail Products ({products.length})
          </h1>
        </div>
        <button
          onClick={handleOpenAdd}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
        >
          <Plus size={15} />
          Add Retail Product
        </button>
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="flex max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
            <Search size={16} className="text-[#747A72] mr-2" />
            <input
              type="text"
              placeholder="Search retail products by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
            />
          </div>

          {/* Products Table */}
          <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
            <table className="w-full min-w-[700px] border-collapse text-left text-xs text-[#292D29]">
              <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                <tr>
                  <th className="px-5 py-3.5 font-bold">Product Name</th>
                  <th className="px-5 py-3.5 font-bold">Retail Price</th>
                  <th className="px-5 py-3.5 font-bold">Stock Available</th>
                  <th className="px-5 py-3.5 font-bold">Min Reorder Level</th>
                  <th className="px-5 py-3.5 font-bold">Status</th>
                  <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E4DD]">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-[#747A72] italic bg-transparent">
                      No retail products found.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => {
                    const qty = product.quantity ?? 0;
                    const threshold = product.lowStockThreshold ?? 5;
                    const isOutOfStock = qty <= 0;
                    const isLowStock = !isOutOfStock && qty <= threshold;

                    return (
                      <tr key={product.id} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                        <td className="px-5 py-3.5 font-semibold text-[#2F352F]">
                          <div>{product.name}</div>
                          {product.description && (
                            <div className="text-[10px] text-[#747A72] font-normal mt-0.5 line-clamp-1">
                              {product.description}
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-[#2F352F] font-bold">
                          {formatCurrency(product.price)}
                        </td>
                        <td className="px-5 py-3.5 text-[#747A72] font-semibold">
                          {qty} units
                        </td>
                        <td className="px-5 py-3.5 text-[#747A72] font-medium">
                          {threshold} units
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                              isOutOfStock
                                ? "bg-[#FBEBEB] text-[#B55B5B] border-[#FBEBEB]"
                                : isLowStock
                                  ? "bg-[#FAF4E8] text-[#B18A45] border-[#B18A45]/30"
                                  : "bg-[#E8ECE5] text-[#2F352F] border-[#CCD2C8]"
                            }`}
                          >
                            {isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : "In Stock"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(product)}
                              className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                              title="Edit"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => product.id && handleDeleteTrigger(product.id)}
                              className="grid size-8 place-items-center rounded-lg bg-[#FFFFFF] border border-[#E0E4DD] text-[#B55B5B] hover:bg-[#FBEBEB] hover:border-[#FBEBEB] transition cursor-pointer shadow-xs"
                              title="Remove"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] overflow-y-auto max-h-[90vh] z-10 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">
              {editingProduct ? "Edit Retail Product" : "New Retail Product"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Product Name *
                </span>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Kerastase Nutritive Shampoo"
                  className="mt-1 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">
                    Retail Price (₹) *
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={formData.price === 0 ? "" : formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value === "" ? 0 : Number(e.target.value) })}
                    placeholder="0"
                    className="mt-1 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">
                    Stock Quantity *
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    value={formData.quantity === 0 ? "" : formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                    placeholder="0"
                    className="mt-1 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Minimum Reorder Level
                </span>
                <input
                  type="number"
                  min="0"
                  value={formData.lowStockThreshold === 0 ? "" : formData.lowStockThreshold}
                  onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value === "" ? 0 : Number(e.target.value) })}
                  placeholder="5"
                  className="mt-1 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">
                  Description
                </span>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional retail product notes..."
                  className="mt-1 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] p-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] transition resize-none"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-[#E0E4DD] px-4 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-4 py-2 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
                >
                  {editingProduct ? "Save Changes" : "Create Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-[#292D29]/40 backdrop-blur-xs"
            onClick={() => setDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200">
            <h3 className="font-serif text-base font-bold text-[#2F352F] mb-2">
              Remove Product
            </h3>
            <p className="text-xs text-[#747A72] mb-5">
              Are you sure you want to remove this retail product from the inventory list?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-xl border border-[#E0E4DD] px-3.5 py-2 text-xs font-bold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="rounded-xl bg-[#B55B5B] hover:bg-[#9E4747] px-3.5 py-2 text-xs font-bold text-white transition duration-150 cursor-pointer shadow-xs"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}