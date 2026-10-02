import { Metadata } from "next";
import { AppointmentsCalendar } from "@/components/appointments/AppointmentsCalendar";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Appointments | BLOW SALON",
  description: "Manual appointment management and specialist scheduling for BLOW SALON.",
};

export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <AppointmentsCalendar />
    </Suspense>
  );
}
