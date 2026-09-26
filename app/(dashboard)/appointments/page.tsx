import { Metadata } from "next";
import { AppointmentsCalendar } from "@/components/appointments/AppointmentsCalendar";

export const metadata: Metadata = {
  title: "Appointments | BLOW SALON",
  description: "Manual appointment management and specialist scheduling for BLOW SALON.",
};

export default function AppointmentsPage() {
  return <AppointmentsCalendar />;
}
