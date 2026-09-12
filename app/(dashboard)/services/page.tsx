"use client";

import { useState } from "react";
import * as servicesService from "@/services/services";
import * as serviceCategoriesService from "@/services/serviceCategories";
import { useAppData } from "@/context/AppDataContext";
import type { Service, ServiceVariant } from "@/types/service";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Scissors,
  FolderPlus,
  Tag,
  Check,
  Layers,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { formatCurrency } from "@/components/salon-dashboard/types";
import { toast } from "react-hot-toast";

export default function ServicesPage() {
  const { services, refreshServices, loadingAppData, categories, refreshCategories } = useAppData();
  const loading = loadingAppData;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGender, setSelectedGender] = useState<"all" | "men" | "women" | "both">("all");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Service Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    gender: "both" as "men" | "women" | "both",
    price: 0,
    startingPrice: undefined as number | undefined,
    priceLabel: "",
    priceUnit: "",
    isActive: true,
    variants: [] as ServiceVariant[],
  });

  // Variant helper state inside modal
  const [showVariantsEditor, setShowVariantsEditor] = useState(false);

  // Category Modal states
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryModalName, setCategoryModalName] = useState("");
  const [categoryModalGender, setCategoryModalGender] = useState<"men" | "women" | "both">("both");
  const [loadingCategoryModal, setLoadingCategoryModal] = useState(false);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);

  // Inline category input state
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loadingNewCategory, setLoadingNewCategory] = useState(false);

  // Delete Service Confirmation Modal states
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [idToDelete, setIdToDelete] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingService(null);
    const defaultCat = categories[0]?.name || "Men's Haircut";
    setFormData({
      name: "",
      category: defaultCat,
      gender: "men",
      price: 0,
      startingPrice: undefined,
      priceLabel: "",
      priceUnit: "",
      isActive: true,
      variants: [],
    });
    setShowVariantsEditor(false);
    setShowNewCategoryInput(categories.length === 0);
    setNewCategoryName("");
    setModalOpen(true);
  };

  const handleOpenEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      category: service.category || categories[0]?.name || "",
      gender: service.gender || "both",
      price: service.price || 0,
      startingPrice: service.startingPrice,
      priceLabel: service.priceLabel || "",
      priceUnit: service.priceUnit || "",
      isActive: service.isActive !== false,
      variants: service.variants ? [...service.variants] : [],
    });
    setShowVariantsEditor(!!(service.variants && service.variants.length > 0));
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

  const handleAddVariantRow = () => {
    setFormData((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        { name: "Regular", price: prev.price || 0 },
      ],
    }));
  };

  const handleRemoveVariantRow = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  };

  const handleVariantChange = (index: number, field: keyof ServiceVariant, value: any) => {
    setFormData((prev) => {
      const updated = [...prev.variants];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, variants: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let categoryToUse = formData.category;

    if (showNewCategoryInput && newCategoryName.trim()) {
      try {
        const trimmed = newCategoryName.trim();
        const titleCased = trimmed
          .replace(/\s+/g, " ")
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(" ");

        const exists = categories.find(
          (c) => c.name.toLowerCase() === titleCased.toLowerCase()
        );

        if (!exists) {
          await serviceCategoriesService.create(titleCased, formData.gender);
          await refreshCategories();
        }
        categoryToUse = titleCased;
      } catch (err: any) {
        console.error("Auto category creation failed:", err);
      }
    }

    if (!categoryToUse) {
      toast.error("Please enter or select a category name.");
      return;
    }

    const payload: Partial<Service> = {
      businessId: "blow-salon",
      name: formData.name.trim(),
      category: categoryToUse,
      gender: formData.gender,
      price: Number(formData.price) || 0,
      isActive: formData.isActive,
    };

    if (formData.startingPrice !== undefined && formData.startingPrice !== null) {
      payload.startingPrice = Number(formData.startingPrice);
    }
    if (formData.priceLabel) payload.priceLabel = formData.priceLabel.trim();
    if (formData.priceUnit) payload.priceUnit = formData.priceUnit.trim();
    if (showVariantsEditor && formData.variants.length > 0) {
      payload.variants = formData.variants.map((v) => ({
        name: v.name.trim(),
        price: Number(v.price) || 0,
        ...(v.startingPrice !== undefined ? { startingPrice: Number(v.startingPrice) } : {}),
        ...(v.priceLabel ? { priceLabel: v.priceLabel.trim() } : {}),
        ...(v.priceUnit ? { priceUnit: v.priceUnit.trim() } : {}),
      }));
    } else {
      payload.variants = undefined;
    }

    try {
      if (editingService?.id) {
        await servicesService.update(editingService.id, payload as any);
        toast.success("Service updated successfully!");
      } else {
        await servicesService.create(payload as any);
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
        setFormData((prev) => ({ ...prev, category: titleCased }));
        setShowNewCategoryInput(false);
        setNewCategoryName("");
        setLoadingNewCategory(false);
        return;
      }

      await serviceCategoriesService.create(titleCased, formData.gender);
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

  const handleCreateCategoryDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = categoryModalName.trim();
    if (!trimmed) {
      toast.error("Please enter a category name.");
      return;
    }

    setLoadingCategoryModal(true);
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
        setLoadingCategoryModal(false);
        return;
      }

      await serviceCategoriesService.create(titleCased, categoryModalGender);
      await refreshCategories();
      setCategoryModalName("");
      toast.success(`Category "${titleCased}" created!`);
    } catch (error: any) {
      console.error("Failed to create category:", error);
      toast.error(error.message || "Failed to create category.");
    } finally {
      setLoadingCategoryModal(false);
    }
  };

  const handleDeleteCategory = async (catId?: string, catName?: string) => {
    if (!catId) return;
    const count = services.filter(
      (s) => s.category?.toLowerCase() === catName?.toLowerCase()
    ).length;

    if (count > 0) {
      if (
        !confirm(
          `There are ${count} service(s) currently assigned to "${catName}". Are you sure you want to remove this category?`
        )
      ) {
        return;
      }
    }

    setDeletingCatId(catId);
    try {
      await serviceCategoriesService.remove(catId);
      await refreshCategories();
      if (selectedCategory.toLowerCase() === catName?.toLowerCase()) {
        setSelectedCategory("All");
      }
      toast.success(`Category "${catName}" removed.`);
    } catch (error: any) {
      console.error("Failed to delete category:", error);
      toast.error("Failed to delete category.");
    } finally {
      setDeletingCatId(null);
    }
  };

  // Filter by gender and category and search query
  const filteredServices = services.filter((s) => {
    // Gender filter
    if (selectedGender !== "all") {
      if (selectedGender === "both") {
        if (s.gender !== "both") return false;
      } else {
        if (s.gender !== selectedGender && s.gender !== "both") return false;
      }
    }

    // Category filter
    if (selectedCategory !== "All") {
      if ((s.category || "").toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = s.name.toLowerCase().includes(q);
      const matchCat = (s.category || "").toLowerCase().includes(q);
      const matchVariants = s.variants?.some((v) => v.name.toLowerCase().includes(q));
      if (!matchName && !matchCat && !matchVariants) return false;
    }

    return true;
  });

  // Calculate counts for gender filter badges
  const menCount = services.filter((s) => s.gender === "men" || s.gender === "both").length;
  const womenCount = services.filter((s) => s.gender === "women" || s.gender === "both").length;
  const bothCount = services.filter((s) => s.gender === "both").length;

  return (
    <div className="w-full text-[#292D29]">
      {/* Top Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#747A72]">
            Blow Salon Catalog
          </p>
          <h1 className="mt-1 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#2F352F]">
            Services
          </h1>
        </div>
        {!loading && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setCategoryModalOpen(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#CCD2C8] bg-[#E8ECE5] hover:bg-[#6F776D] hover:text-white hover:border-[#6F776D] px-4 text-xs font-bold text-[#2F352F] shadow-xs transition duration-150 cursor-pointer"
            >
              <FolderPlus size={16} />
              Manage Categories
            </button>
            <button
              onClick={handleOpenAdd}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-white shadow-xs transition duration-150 cursor-pointer"
            >
              <Plus size={16} />
              Add Service
            </button>
          </div>
        )}
      </div>

      {/* Gender Filter Buttons */}
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => setSelectedGender("all")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs cursor-pointer ${
            selectedGender === "all"
              ? "bg-[#6F776D] text-white"
              : "bg-[#FFFFFF] text-[#747A72] border border-[#E0E4DD] hover:border-[#6F776D] hover:text-[#2F352F]"
          }`}
        >
          <span>All Services</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selectedGender === "all" ? "bg-white/20 text-white" : "bg-[#F7F7F4] text-[#2F352F]"}`}>
            {services.length}
          </span>
        </button>

        <button
          onClick={() => setSelectedGender("men")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs cursor-pointer ${
            selectedGender === "men"
              ? "bg-[#6F776D] text-white"
              : "bg-[#FFFFFF] text-[#747A72] border border-[#E0E4DD] hover:border-[#6F776D] hover:text-[#2F352F]"
          }`}
        >
          <span>👨 Men's Services</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selectedGender === "men" ? "bg-white/20 text-white" : "bg-[#F7F7F4] text-[#2F352F]"}`}>
            {menCount}
          </span>
        </button>

        <button
          onClick={() => setSelectedGender("women")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs cursor-pointer ${
            selectedGender === "women"
              ? "bg-[#6F776D] text-white"
              : "bg-[#FFFFFF] text-[#747A72] border border-[#E0E4DD] hover:border-[#6F776D] hover:text-[#2F352F]"
          }`}
        >
          <span>👩 Women's Services</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selectedGender === "women" ? "bg-white/20 text-white" : "bg-[#F7F7F4] text-[#2F352F]"}`}>
            {womenCount}
          </span>
        </button>

        <button
          onClick={() => setSelectedGender("both")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-xs cursor-pointer ${
            selectedGender === "both"
              ? "bg-[#6F776D] text-white"
              : "bg-[#FFFFFF] text-[#747A72] border border-[#E0E4DD] hover:border-[#6F776D] hover:text-[#2F352F]"
          }`}
        >
          <span>✨ Unisex / Both</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${selectedGender === "both" ? "bg-white/20 text-white" : "bg-[#F7F7F4] text-[#2F352F]"}`}>
            {bothCount}
          </span>
        </button>
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
          <h2 className="text-lg font-serif font-bold text-[#2F352F]">No services found in Firestore database.</h2>
          <p className="mt-1.5 max-w-sm text-xs text-[#747A72]">
            Run the seed script or create services to populate your catalog.
          </p>
        </div>
      ) : (
        <>
          {/* Category Horizontal Pill Filters */}
          <div className="mb-6 overflow-x-auto pb-2 scrollbar-thin">
            <div className="flex items-stretch gap-2.5 min-w-max">
              <button
                onClick={() => setSelectedCategory("All")}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs cursor-pointer ${
                  selectedCategory === "All"
                    ? "bg-[#2F352F] text-[#FFFFFF]"
                    : "bg-[#FFFFFF] border border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F]"
                }`}
              >
                All Categories ({filteredServices.length})
              </button>

              {categories.map((cat) => {
                const count = services.filter((s) => {
                  const matchCat = s.category?.toLowerCase() === cat.name.toLowerCase();
                  if (!matchCat) return false;
                  if (selectedGender !== "all") {
                    if (selectedGender === "both") return s.gender === "both";
                    return s.gender === selectedGender || s.gender === "both";
                  }
                  return true;
                }).length;

                if (count === 0 && selectedGender !== "all") return null;

                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.name)}
                    className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-2 ${
                      selectedCategory.toLowerCase() === cat.name.toLowerCase()
                        ? "bg-[#2F352F] text-[#FFFFFF]"
                        : "bg-[#FFFFFF] border border-[#E0E4DD] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F]"
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                      selectedCategory.toLowerCase() === cat.name.toLowerCase()
                        ? "bg-white/20 text-white"
                        : "bg-[#F7F7F4] text-[#747A72]"
                    }`}>
                      {count}
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
              placeholder="Search services by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#292D29] outline-none placeholder:text-[#747A72]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-[#747A72] hover:text-[#2F352F]"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Grouped Services by Category */}
          {(() => {
            const categoriesInFiltered = Array.from(
              new Set(filteredServices.map((s) => s.category || "General"))
            ).sort((a, b) => a.localeCompare(b));

            if (categoriesInFiltered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-12 text-center shadow-xs">
                  <p className="text-xs text-[#747A72]">No services match your filters.</p>
                </div>
              );
            }

            return (
              <div className="space-y-6">
                {categoriesInFiltered.map((catName) => {
                  const catServices = filteredServices.filter(
                    (s) => (s.category || "General").toLowerCase() === catName.toLowerCase()
                  );

                  return (
                    <div key={catName} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-[#6F776D]">
                          {catName}
                        </h3>
                        <span className="rounded-full bg-[#E8ECE5] border border-[#CCD2C8] px-2.5 py-0.5 text-[10px] text-[#2F352F] font-bold">
                          {catServices.length} {catServices.length === 1 ? "service" : "services"}
                        </span>
                        <div className="h-px flex-1 bg-[#E0E4DD]" />
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] shadow-xs">
                        <table className="w-full min-w-[750px] border-collapse text-left text-xs text-[#292D29]">
                          <thead className="bg-[#F7F7F4] text-[10px] font-bold uppercase tracking-wider text-[#747A72] border-b border-[#E0E4DD]">
                            <tr>
                              <th className="px-5 py-3.5 font-bold">Service Name</th>
                              <th className="px-5 py-3.5 font-bold">Gender</th>
                              <th className="px-5 py-3.5 font-bold">Pricing & Variants</th>
                              <th className="px-5 py-3.5 font-bold">Status</th>
                              <th className="px-5 py-3.5 font-bold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E0E4DD]">
                            {catServices.map((service) => {
                              const hasVariants = service.variants && service.variants.length > 0;
                              const isOnwards = service.priceLabel === "onwards" || service.startingPrice !== undefined;

                              return (
                                <tr key={service.id} className="hover:bg-[#F7F7F4]/60 transition bg-transparent">
                                  <td className="px-5 py-3.5 font-semibold text-[#2F352F]">
                                    <div>
                                      <span>{service.name}</span>
                                      {service.priceUnit && (
                                        <span className="ml-2 inline-block rounded-md bg-[#FAF4E8] text-[#B18A45] border border-[#B18A45]/30 px-1.5 py-0.2 text-[10px] font-bold">
                                          {service.priceUnit}
                                        </span>
                                      )}
                                      {service.priceLabel && service.priceLabel !== "onwards" && (
                                        <span className="ml-2 inline-block rounded-md bg-[#E8ECE5] text-[#2F352F] border border-[#CCD2C8] px-1.5 py-0.2 text-[10px] font-bold">
                                          {service.priceLabel}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                                      service.gender === "men"
                                        ? "bg-[#EBF3FC] text-[#2B6CB0] border-[#2B6CB0]/20"
                                        : service.gender === "women"
                                        ? "bg-[#FDF2F8] text-[#B83280] border-[#B83280]/20"
                                        : "bg-[#F0FDF4] text-[#276749] border-[#276749]/20"
                                    }`}>
                                      {service.gender === "men" ? "Men" : service.gender === "women" ? "Women" : "Both"}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3.5 font-bold text-[#2F352F]">
                                    {hasVariants ? (
                                      <div className="space-y-1">
                                        <div className="text-xs font-bold text-[#2F352F]">
                                          {formatCurrency(service.price)} {isOnwards && <span className="text-[10px] font-semibold text-[#747A72]">onwards</span>}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {service.variants?.map((v, i) => (
                                            <span
                                              key={i}
                                              className="inline-flex items-center gap-1 rounded-lg bg-[#F7F7F4] border border-[#E0E4DD] px-2 py-0.5 text-[10px] font-medium text-[#2F352F]"
                                            >
                                              <span className="font-semibold text-[#747A72]">{v.name}:</span>
                                              <span className="font-bold text-[#6F776D]">{formatCurrency(v.price)}</span>
                                              {v.priceLabel && <span className="text-[9px] text-[#747A72]">({v.priceLabel})</span>}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        <span className="text-sm font-bold text-[#2F352F]">
                                          {formatCurrency(service.price)}
                                        </span>
                                        {isOnwards && (
                                          <span className="ml-1.5 text-xs font-semibold text-[#747A72]">
                                            onwards
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5">
                                    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                                      service.isActive !== false
                                        ? "bg-[#E8ECE5] text-[#2F352F]"
                                        : "bg-[#FBEBEB] text-[#B55B5B]"
                                    }`}>
                                      {service.isActive !== false ? "Active" : "Inactive"}
                                    </span>
                                  </td>
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
                              );
                            })}
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

      {/* DEDICATED ADD / MANAGE CATEGORIES MODAL */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setCategoryModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] animate-in zoom-in-95 duration-200 z-10">
            <button
              onClick={() => setCategoryModalOpen(false)}
              className="absolute top-4 right-4 text-[#747A72] hover:text-[#2F352F] transition cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2.5 mb-1">
              <div className="grid size-9 place-items-center rounded-xl bg-[#E8ECE5] text-[#2F352F]">
                <FolderPlus size={18} />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-[#2F352F]">
                  Service Categories ({categories.length})
                </h2>
                <p className="text-[11px] text-[#747A72]">
                  Add and organize your salon menu categories
                </p>
              </div>
            </div>

            {/* Add Category Form */}
            <form onSubmit={handleCreateCategoryDirect} className="mt-5 rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 space-y-3">
              <span className="text-xs font-bold text-[#2F352F]">Add New Category</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  required
                  placeholder="e.g. Men's Haircut"
                  value={categoryModalName}
                  onChange={(e) => setCategoryModalName(e.target.value)}
                  className="sm:col-span-2 h-10 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3.5 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                />
                <select
                  value={categoryModalGender}
                  onChange={(e) => setCategoryModalGender(e.target.value as any)}
                  className="h-10 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-2.5 text-xs text-[#292D29] outline-none focus:border-[#6F776D]"
                >
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={loadingCategoryModal || !categoryModalName.trim()}
                className="w-full inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#6F776D] px-4 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <Plus size={15} />
                {loadingCategoryModal ? "Adding..." : "Add Category"}
              </button>
            </form>

            {/* Existing Categories List */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#747A72]">
                  Existing Categories ({categories.length})
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {categories.map((cat) => {
                  const count = services.filter(
                    (s) => s.category?.toLowerCase() === cat.name.toLowerCase()
                  ).length;

                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3.5 py-2.5 shadow-2xs hover:bg-[#F7F7F4]/70 transition"
                    >
                      <div className="flex items-center gap-2.5">
                        <Tag size={14} className="text-[#6F776D]" />
                        <span className="text-xs font-bold text-[#2F352F]">{cat.name}</span>
                        <span className="rounded-full bg-[#E8ECE5] px-2 py-0.5 text-[10px] font-semibold text-[#6F776D]">
                          {count} {count === 1 ? "service" : "services"}
                        </span>
                      </div>
                      {cat.id && (
                        <button
                          type="button"
                          disabled={deletingCatId === cat.id}
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          className="text-[#747A72] hover:text-[#B55B5B] p-1 rounded transition cursor-pointer disabled:opacity-40"
                          title="Delete category"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="h-9 rounded-xl bg-[#6F776D] hover:bg-[#2F352F] px-5 text-xs font-bold text-[#FFFFFF] transition cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SERVICE ADD / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-6 shadow-xl text-[#292D29] animate-in zoom-in-95 duration-200 z-10 scrollbar-thin">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-[#747A72]">Service Name *</span>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] focus:ring-1 focus:ring-[#6F776D] placeholder-[#747A72]"
                    placeholder="e.g. Basic Hair Spa"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Gender Applicability *</span>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] font-semibold"
                  >
                    <option value="men">Men</option>
                    <option value="women">Women</option>
                    <option value="both">Both (Unisex)</option>
                  </select>
                </label>

                {/* Category selector / creator */}
                <div className="block">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#747A72]">Category *</span>
                    <button
                      type="button"
                      onClick={() => setShowNewCategoryInput(!showNewCategoryInput)}
                      className="text-[11px] font-bold text-[#6F776D] hover:text-[#2F352F] transition cursor-pointer"
                    >
                      {showNewCategoryInput ? "Choose from list" : "+ New category"}
                    </button>
                  </div>

                  {!showNewCategoryInput ? (
                    <select
                      value={formData.category}
                      onChange={(e) => {
                        if (e.target.value === "ADD_NEW") {
                          setShowNewCategoryInput(true);
                        } else {
                          setFormData({ ...formData, category: e.target.value });
                        }
                      }}
                      className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D]"
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                      <option value="ADD_NEW">+ Add new category</option>
                    </select>
                  ) : (
                    <div className="mt-1.5 flex gap-2">
                      <input
                        type="text"
                        placeholder="New category..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="h-10 flex-1 rounded-xl border border-[#E0E4DD] bg-[#FFFFFF] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] placeholder-[#747A72]"
                      />
                      <button
                        type="button"
                        disabled={loadingNewCategory || !newCategoryName.trim()}
                        onClick={handleAddNewCategory}
                        className="h-10 rounded-xl bg-[#6F776D] px-3 text-xs font-bold text-[#FFFFFF] hover:bg-[#2F352F] transition disabled:opacity-50 cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Base Price (INR) *</span>
                  <input
                    required
                    type="number"
                    min="0"
                    value={formData.price === 0 ? "" : formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] font-bold"
                    placeholder="0"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Price Label</span>
                  <input
                    type="text"
                    value={formData.priceLabel}
                    onChange={(e) => setFormData({ ...formData, priceLabel: e.target.value })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] placeholder-[#747A72]"
                    placeholder="e.g. onwards, up to neck"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-[#747A72]">Price Unit</span>
                  <input
                    type="text"
                    value={formData.priceUnit}
                    onChange={(e) => setFormData({ ...formData, priceUnit: e.target.value })}
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] px-3 text-xs text-[#292D29] outline-none focus:border-[#6F776D] placeholder-[#747A72]"
                    placeholder="e.g. per streak, per finger"
                  />
                </label>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="size-4 rounded border-[#E0E4DD] accent-[#6F776D]"
                  />
                  <span className="text-xs font-semibold text-[#2F352F]">Active in service catalog</span>
                </label>
              </div>

              {/* Pricing Variants Section */}
              <div className="rounded-2xl border border-[#E0E4DD] bg-[#F7F7F4] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={15} className="text-[#6F776D]" />
                    <span className="text-xs font-bold text-[#2F352F]">Pricing Variants / Size Options</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!showVariantsEditor) {
                        setShowVariantsEditor(true);
                        if (formData.variants.length === 0) {
                          setFormData((prev) => ({
                            ...prev,
                            variants: [
                              { name: "Regular", price: prev.price || 0 },
                              { name: "Small", price: prev.price || 0 },
                              { name: "Medium", price: prev.price || 0 },
                              { name: "Long", price: prev.price || 0 },
                            ],
                          }));
                        }
                      } else {
                        setShowVariantsEditor(false);
                      }
                    }}
                    className="text-[11px] font-bold text-[#6F776D] hover:text-[#2F352F] transition cursor-pointer"
                  >
                    {showVariantsEditor ? "Hide Variants" : "+ Configure Variants"}
                  </button>
                </div>

                {showVariantsEditor && (
                  <div className="space-y-2 pt-2 border-t border-[#E0E4DD]">
                    {formData.variants.map((variant, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-[#FFFFFF] p-2 rounded-xl border border-[#E0E4DD]">
                        <input
                          type="text"
                          required
                          placeholder="Variant name (e.g. Regular, Small, 1 Inch)"
                          value={variant.name}
                          onChange={(e) => handleVariantChange(idx, "name", e.target.value)}
                          className="h-8 flex-1 rounded-lg border border-[#E0E4DD] px-2.5 text-xs text-[#292D29] outline-none focus:border-[#6F776D]"
                        />
                        <div className="flex items-center gap-1 w-28">
                          <span className="text-xs font-bold text-[#747A72]">₹</span>
                          <input
                            type="number"
                            min="0"
                            required
                            placeholder="Price"
                            value={variant.price === 0 ? "" : variant.price}
                            onChange={(e) => handleVariantChange(idx, "price", e.target.value === "" ? 0 : Number(e.target.value))}
                            className="h-8 w-full rounded-lg border border-[#E0E4DD] px-2 text-xs font-bold text-[#2F352F] outline-none focus:border-[#6F776D]"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Label (e.g. onwards)"
                          value={variant.priceLabel || ""}
                          onChange={(e) => handleVariantChange(idx, "priceLabel", e.target.value)}
                          className="h-8 w-28 rounded-lg border border-[#E0E4DD] px-2 text-[11px] text-[#292D29] outline-none focus:border-[#6F776D]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveVariantRow(idx)}
                          className="text-[#747A72] hover:text-[#B55B5B] p-1.5 rounded transition cursor-pointer"
                          title="Remove variant"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleAddVariantRow}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-[#CCD2C8] bg-[#FFFFFF] px-3 text-xs font-bold text-[#6F776D] hover:border-[#6F776D] hover:text-[#2F352F] transition cursor-pointer"
                    >
                      <Plus size={13} /> Add Variant Option
                    </button>
                  </div>
                )}
              </div>

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
            <p className="mt-1.5 text-xs text-[#747A72]">This action will mark the service as inactive.</p>
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
