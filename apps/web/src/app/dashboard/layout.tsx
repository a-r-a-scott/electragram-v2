"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const tokens = useAuthStore((s) => s.tokens);

  useEffect(() => {
    if (!tokens?.accessToken) {
      router.replace("/sign-in");
    }
  }, [tokens, router]);

  if (!tokens?.accessToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">Redirecting...</div>
      </div>
    );
  }

  return <DashboardShell>{children}</DashboardShell>;
}
