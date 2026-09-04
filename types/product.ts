export interface Product {
  id?: string;
  name: string;
  price: number;
  quantity?: number | null; // Retail stock quantity
  lowStockThreshold?: number; // Minimum reorder level
  description?: string;
  isActive?: boolean;
  createdAt?: string;
}


