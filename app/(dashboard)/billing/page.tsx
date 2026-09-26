"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BillingTerminal } from "@/components/billing/BillingTerminal";

function BillingTerminalWithQuery() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit") || undefined;
  const customerId = searchParams.get("customerId") || undefined;
  const customerName = searchParams.get("customerName") || undefined;
  const customerMobile = searchParams.get("customerMobile") || searchParams.get("customerPhone") || undefined;
  const serviceId = searchParams.get("serviceId") || undefined;
  const staffId = searchParams.get("staffId") || undefined;
  const staffName = searchParams.get("staffName") || undefined;
  const appointmentId = searchParams.get("appointmentId") || undefined;

  return (
    <BillingTerminal
      editInvoiceId={editId}
      initialCustomerId={customerId}
      initialCustomerName={customerName}
      initialCustomerMobile={customerMobile}
      initialServiceId={serviceId}
      initialStaffId={staffId}
      initialStaffName={staffName}
      initialAppointmentId={appointmentId}
    />
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[40vh] items-center justify-center">
        <div className="size-9 animate-spin rounded-full border-3 border-[#6F776D] border-t-transparent" />
      </div>
    }>
      <BillingTerminalWithQuery />
    </Suspense>
  );
}