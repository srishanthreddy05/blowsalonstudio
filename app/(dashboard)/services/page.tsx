"use client";

import { useState } from "react";
import * as servicesService from "@/services/services";
import * as serviceCategoriesService from "@/services/serviceCategories";
import { useAppData } from "@/context/AppDataContext";
import type { Service } from "@/types/service";
import { Plus, Search, Edit2, Trash2, X, Scissors } from "lucide-react";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { toast } from "react-hot-toast";

export default function ServicesPage() {
  const { services, refreshServices, loadingAppData, categories, refreshCategories } = useAppData();
  const loading = loadingAppData;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: 0,
    category: "",
  });

  // Inline category management states
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loadingNewCategory, setLoadingNewCategory] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingService(null);
    setFormData({
      name: "",
      price: 0,
      category: categories[0]?.name || "",
    });
    setShowNewCategoryInput(false);
    setNewCategoryName("");
    setModalOpen(true);
  };

  const handleOpenEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      price: service.price,
      category: service.category || categories[0]?.name || "",
    });
    setShowNewCategoryInput(false);
    setNewCategoryName("");
    setModalOpen(true);
  };

  const handleDeleteTrigger = (id: string) => {
    setIdToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!idToDelete) return;
    try {
      await servicesService.delete(idToDelete);
      setDeleteConfirmOpen(false);
      setIdToDelete(null);
      await refreshServices();
      toast.success("Service deleted successfully!");
    } catch (error) {
      console.error("Failed to delete service:", error);
      toast.error("Failed to delete service.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category) {
      toast.error("Please select a category.");
      return;
    }
    try {
      if (editingService?.id) {
        await servicesService.update(editingService.id, formData);
        toast.success("Service updated successfully!");
      } else {
        await servicesService.create(formData);
        toast.success("Service created successfully!");
      }
      setModalOpen(false);
      await refreshServices();
    } catch (error) {
      console.error("Failed to save service:", error);
      toast.error("Failed to save service.");
    }
  };

  const handleAddNewCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error("Category name cannot be empty");
      return;
    }

    setLoadingNewCategory(true);
    try {
      const titleCased = trimmed
        .replace(/\s+/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

      const exists = categories.some(
        (c) => c.name.toLowerCase() === titleCased.toLowerCase()
      );
      if (exists) {
        toast.error(`Category "${titleCased}" already exists.`);
        setLoadingNewCategory(false);
        return;
      }

      await serviceCategoriesService.create(titleCased);
      await refreshCategories();
      setFormData((prev) => ({ ...prev, category: titleCased }));
      setShowNewCategoryInput(false);
      setNewCategoryName("");
      toast.success(`Category "${titleCased}" added successfully!`);
    } catch (error: any) {
      console.error("Failed to add category:", error);
      toast.error(error.message || "Failed to add category.");
    } finally {
      setLoadingNewCategory(false);
    }
  };

  const filteredServices = services.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-full text-[#292D29]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Service Menu Catalog
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Services
          </h1>
        </div>
        {!loading && services.length > 0 && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Add Service
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
        </div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#F7F7F4] text-[#6F776D] border border-[#E0E4DD] mb-4">
            <Scissors size={28} />
          </div>
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">No Services Found</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            Define your service menu catalog so you can invoice clients and book appointments.
          </p>
          <button
            onClick={handleOpenAdd}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
          >
            <Plus size={16} />
            Add Service
          </button>
        </div>
      ) : (
        <>
          {/* Category Cards Top Row */}
          <div className="mb-6 overflow-x-auto pb-2 scrollbar-thin">
            <div className="flex gap-3 min-w-max">
              {/* All Card */}
              <button
                onClick={() => setSelectedCategory("All")}
                className={`flex flex-col min-w-[120px] rounded-2xl border p-3.5 transition-all duration-150 cursor-pointer text-left shadow-xs ${
                  selectedCategory === "All"
                    ? "bg-[#6F776D] border-[#6F776D] text-[#FFFFFF] font-bold"
                    : "bg-[#FFFFFF] border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5]"
                }`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                  Filter
                </span>
                <span className="mt-0.5 text-sm font-bold">All Services</span>
                <span className="mt-1 text-[11px] font-semibold opacity-90">
                  {services.length} {services.length === 1 ? "service" : "services"}
                </span>
              </button>

              {/* Dynamic Category Cards */}
              {categories.map((cat) => {
                const count = services.filter(
                  (s) => s.category?.toLowerCase() === cat.name.toLowerCase()
                ).length;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`flex flex-col min-w-[140px] rounded-2xl border p-3.5 transition-all duration-150 cursor-pointer text-left shadow-xs ${
                      selectedCategory === cat.name
                        ? "bg-[#6F776D] border-[#6F776D] text-[#FFFFFF] font-bold"
                        : "bg-[#FFFFFF] border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5]"
                    }`}
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                      Category
                    </span>
                    <span className="mt-0.5 text-sm font-bold truncate w-[110px]" title={cat.name}>
                      {cat.name}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold opacity-90">
                      {count} {count === 1 ? "service" : "services"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search bar */}
          <div className="mb-6 flex max-w-md items-center rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 h-11 shadow-xs focus-within:border-[#6F776D] focus-within:ring-1 focus-within:ring-[#6F776D] transition">
            <Search size={16} className="text-[#747A72] mr-2" />
            <input
              type="text"
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
            />
          </div>

          {/* Grouped Services List Display */}
          {(() => {
            const categoriesToRender = categories.filter((cat) => {
              if (selectedCategory !== "All" && selectedCategory.toLowerCase() !== cat.name.toLowerCase()) {
                return false;
              }
              const catServices = filteredServices.filter(
                (s) => (s.category || "General").toLowerCase() === cat.name.toLowerCase()
              );
              return catServices.length > 0;
            });

            const untrackedCategories = Array.from(
              new Set(
                filteredServices
                  .map((s) => s.category || "General")
                  .filter(
                    (catName) =>
                      !categories.some((c) => c.name.toLowerCase() === catName.toLowerCase())
                  )
              )
            );

            const allCategoriesToRender = [
              ...categoriesToRender.map((c) => c.name),
              ...untrackedCategories.filter(
                (catName) =>
                  selectedCategory === "All" ||
                  selectedCategory.toLowerCase() === catName.toLowerCase()
              ),
            ];

            if (allCategoriesToRender.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
                  <p className="text-xs text-[#747A72]">No services found matching the criteria.</p>
                </div>
              );
            }

            return (
              <div className="space-y-6">
                {allCategoriesToRender.map((catName) => {
                  const catServices = filteredServices.filter(
                    (s) => (s.category || "General").toLowerCase() === catName.toLowerCase()
                  );

                  return (
                    <div key={catName} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#6F776D]">
                          {catName}
                        </h3>
                        <span className="rounded-full bg-[#E8ECE5] border border-[#CCD2C8] px-2 py-0.5 text-[10px] text-[#2F352F] font-bold">
                          {catServices.length} {catServices.length === 1 ? "service" : "services"}
                        </span>
                        <div className="h-px flex-1 bg-[#E0E4DD]" />
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
                        <table className="w-full min-w-[700px] border-collapse text-left text-xs text-[#292D29]">
                          <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                            <tr>
                              <th className="px-5 py-3.5 font-bold">Service Name</th>
                              <th className="px-5 py-3.5 font-bold">Price</th>
                              <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E0E4DD]">
                            {catServices.map((service) => (
                              <tr key={service.id} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                                <td className="px-5 py-3.5 font-semibold text-[#2F352F]">{service.name}</td>
                                <td className="px-5 py-3.5 font-bold text-[#2F352F]">{formatCurrency(service.price)}</td>
                                <td className="px-5 py-3.5 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => handleOpenEdit(service)}
                                      className="grid size-8 place-items-center rounded-lg bg-[#E8ECE5] border border-[#CCD2C8] text-[#2F352F] hover:bg-[#6F776D] hover:text-[#FFFFFF] transition cursor-pointer shadow-xs"
                                      title="Edit"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      onClick={() => service.id && handleDeleteTrigger(service.id)}
                                      className="grid size-8 place-items-center rounded-lg bg-[#FFFFFF] border border-[#E0E4DD] text-[#B55B5B] hover:bg-[#FBEBEB] hover:border-[#FBEBEB] transition cursor-pointer shadow-xs"
                                      title="Delete"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      {/* Modal Overlay Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] animate-in zoom-in-95 duration-200 z-10">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <h2 className="font-serif text-lg font-bold text-[#2F352F] mb-4">
              {editingService ? "Edit Service Detail" : "Add Service"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Service Name</span>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                  placeholder="e.g. Luxury Hair Spa"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Category</span>
                <select
                  value={formData.category}
                  onChange={(e) => {
                    if (e.target.value === "ADD_NEW") {
                      setShowNewCategoryInput(true);
                    } else {
                      setShowNewCategoryInput(false);
                      setFormData({ ...formData, category: e.target.value });
                    }
                  }}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                  <option value="ADD_NEW">+ Add new category</option>
                </select>
              </label>

              {showNewCategoryInput && (
                <div className="mt-3 rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-3.5 space-y-2.5">
                  <span className="text-xs font-semibold text-[#747A72]">New Category Name</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Nail Art"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="h-9 flex-1 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] placeholder-[#747A72]"
                    />
                    <button
                      type="button"
                      disabled={loadingNewCategory}
                      onClick={handleAddNewCategory}
                      className="h-9 rounded-xl bg-[#6F776D] px-3.5 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition disabled:opacity-50 cursor-pointer"
                    >
                      {loadingNewCategory ? "Adding..." : "Add"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCategoryInput(false);
                        setNewCategoryName("");
                      }}
                      className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-[#747A72]">Price (INR)</span>
                <input
                  required
                  type="number"
                  min="0"
                  value={formData.price === 0 ? "" : formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D]"
                />
              </label>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-4 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#2F352F] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-[#6F776D] px-5 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition cursor-pointer shadow-xs"
                >
                  Save Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setDeleteConfirmOpen(false)} />
          <div className="relative w-full max-w-sm rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] z-10 animate-in zoom-in-95 duration-200">
            <h3 className="font-serif text-base font-bold text-[#2F352F]">Are you sure you want to delete this service?</h3>
            <p className="mt-1.5 text-xs text-[#747A72]">This action cannot be undone and will remove the record immediately.</p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="h-9 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3.5 text-xs font-semibold text-[#747A72] hover:bg-[#F7F7F4] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="h-9 rounded-xl bg-[#B55B5B] hover:bg-[#9E4D4D] px-4 text-xs font-bold text-[#FFFFFF] shadow-xs transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
