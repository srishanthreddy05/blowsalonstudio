import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { NoScrollNumbers } from "@/components/NoScrollNumbers";

import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "BLOW SALON — Management Suite",
  description: "BLOW SALON Management & Billing ERP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col bg-[#F7F7F4] text-[#292D29]">
        <AuthProvider>
          <NoScrollNumbers />
          {children}
        </AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#FFFFFF",
              color: "#292D29",
              border: "1px solid #E0E4DD",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)",
              borderRadius: "14px",
              fontSize: "13px",
              fontWeight: 500,
            },
            success: {
              iconTheme: {
                primary: "#5F7A62",
                secondary: "#FFFFFF",
              },
            },
            error: {
              iconTheme: {
                primary: "#B55B5B",
                secondary: "#FFFFFF",
              },
            },
          }}
        />
      </body>
    </html>
  );
}
