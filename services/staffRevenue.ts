import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { toLocalDateString } from "@/lib/utils/date";
import { getBusinessMonth } from "@/lib/utils/businessMonth";

export interface StaffRevenueRecordItem {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  servicesCount: number;
  amount: number;
  dateKey: string;
}

export interface StaffMonthRevenueData {
  totalMonthRevenue: number;
  dailyRevenue: Record<string, number>; // dateKey -> total revenue
  dailyRecords: Record<string, StaffRevenueRecordItem[]>; // dateKey -> list of grouped invoice records
}

/**
 * Fetch and aggregate completed revenue and grouped invoice records for a single staff member in a selected month.
 */
export async function getStaffMonthRevenue(
  monthStr: string, // YYYY-MM
  staffId?: string,
  staffName?: string
): Promise<StaffMonthRevenueData> {
  const bm = getBusinessMonth(monthStr);
  const startOfMonth = bm.startDate;
  const endOfMonth = bm.endDate;

  const invRef = collection(db, "invoices");
  const q = query(
    invRef,
    where("date", ">=", Timestamp.fromDate(startOfMonth)),
    where("date", "<=", Timestamp.fromDate(endOfMonth))
  );

  const snap = await getDocs(q);
  let totalMonthRevenue = 0;
  const dailyRevenue: Record<string, number> = {};
  const dailyRecords: Record<string, StaffRevenueRecordItem[]> = {};

  snap.forEach((docSnap) => {
    const inv = docSnap.data();
    const invId = docSnap.id;
    const invDate = inv.date?.toDate
      ? inv.date.toDate()
      : new Date(inv.date || inv.billDate || inv.createdAt);
    const dateKey = toLocalDateString(invDate);

    let staffInvoiceRevenue = 0;
    let staffServicesCount = 0;

    (inv.services || []).forEach((s: any) => {
      if (s.serviceId === "membership_fee" || s.isSystemService === true) return;

      const isMatch =
        (staffId && s.staffId === staffId) ||
        (staffName && (s.staffName === staffName || s.staff === staffName));

      if (isMatch) {
        const rawAmount =
          s.amount !== undefined
            ? Number(s.amount) || 0
            : Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);
        const amount = Math.round(rawAmount);

        staffInvoiceRevenue += amount;
        staffServicesCount += 1;
      }
    });

    if (staffServicesCount > 0) {
      totalMonthRevenue += staffInvoiceRevenue;
      dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + staffInvoiceRevenue;

      if (!dailyRecords[dateKey]) {
        dailyRecords[dateKey] = [];
      }

      dailyRecords[dateKey].push({
        invoiceId: invId,
        invoiceNumber: inv.invoiceNumber || "INV",
        customerName: inv.customerName || "Customer",
        servicesCount: staffServicesCount,
        amount: staffInvoiceRevenue,
        dateKey,
      });
    }
  });

  return {
    totalMonthRevenue: Math.round(totalMonthRevenue),
    dailyRevenue,
    dailyRecords,
  };
}

/**
 * Fetch and aggregate completed revenue and grouped invoice records for all staff in a selected month with a single query.
 */
export async function getAllStaffMonthRevenue(
  monthStr: string,
  staffList: { id?: string; name: string }[]
): Promise<Record<string, StaffMonthRevenueData>> {
  const bm = getBusinessMonth(monthStr);
  const startOfMonth = bm.startDate;
  const endOfMonth = bm.endDate;

  const invRef = collection(db, "invoices");
  const q = query(
    invRef,
    where("date", ">=", Timestamp.fromDate(startOfMonth)),
    where("date", "<=", Timestamp.fromDate(endOfMonth))
  );

  const snap = await getDocs(q);
  const result: Record<string, StaffMonthRevenueData> = {};

  staffList.forEach((stf) => {
    if (stf.id) {
      result[stf.id] = {
        totalMonthRevenue: 0,
        dailyRevenue: {},
        dailyRecords: {},
      };
    }
  });

  snap.forEach((docSnap) => {
    const inv = docSnap.data();
    const invId = docSnap.id;
    const invDate = inv.date?.toDate
      ? inv.date.toDate()
      : new Date(inv.date || inv.billDate || inv.createdAt);
    const dateKey = toLocalDateString(invDate);

    // Group matching line items by staff for this invoice
    const staffInvoiceAggregation: Record<
      string,
      { revenue: number; servicesCount: number }
    > = {};

    (inv.services || []).forEach((s: any) => {
      if (s.serviceId === "membership_fee" || s.isSystemService === true) return;
      const sStaffId = s.staffId;
      const sStaffName = s.staffName || s.staff;

      const matchedStaff = staffList.find(
        (stf) => (sStaffId && stf.id === sStaffId) || (sStaffName && stf.name === sStaffName)
      );

      if (matchedStaff && matchedStaff.id) {
        const rawAmount =
          s.amount !== undefined
            ? Number(s.amount) || 0
            : Math.max((Number(s.price) || 0) - (Number(s.discount) || 0), 0);
        const amount = Math.round(rawAmount);

        if (!staffInvoiceAggregation[matchedStaff.id]) {
          staffInvoiceAggregation[matchedStaff.id] = {
            revenue: 0,
            servicesCount: 0,
          };
        }
        staffInvoiceAggregation[matchedStaff.id].revenue += amount;
        staffInvoiceAggregation[matchedStaff.id].servicesCount += 1;
      }
    });

    Object.entries(staffInvoiceAggregation).forEach(
      ([staffId, { revenue, servicesCount }]) => {
        if (result[staffId] && servicesCount > 0) {
          result[staffId].totalMonthRevenue += revenue;
          result[staffId].dailyRevenue[dateKey] =
            (result[staffId].dailyRevenue[dateKey] || 0) + revenue;

          if (!result[staffId].dailyRecords[dateKey]) {
            result[staffId].dailyRecords[dateKey] = [];
          }

          result[staffId].dailyRecords[dateKey].push({
            invoiceId: invId,
            invoiceNumber: inv.invoiceNumber || "INV",
            customerName: inv.customerName || "Customer",
            servicesCount,
            amount: revenue,
            dateKey,
          });
        }
      }
    );
  });

  return result;
}
