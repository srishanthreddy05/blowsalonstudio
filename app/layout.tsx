import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Toaster } from "react-hot-toast";
import { NoScrollNumbers } from "@/components/NoScrollNumbers";

export const metadata: Metadata = {
  title: "Demo Salon Management",
  description: "Demo Salon billing and management dashboard",
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
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <NoScrollNumbers />
          {children}
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
