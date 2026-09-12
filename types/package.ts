import { Timestamp } from "firebase/firestore";

export interface Package {
  id?: string;
  businessId: string;
  name: string;
  price: number;
  gender: "men" | "women" | "both";
  includes: string[];
  isActive: boolean;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}
