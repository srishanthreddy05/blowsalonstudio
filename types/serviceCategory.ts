import { Timestamp } from "firebase/firestore";

export interface ServiceCategory {
  id?: string;
  businessId: string;
  name: string;
  gender?: "men" | "women" | "both";
  createdAt: Timestamp | string;
}
