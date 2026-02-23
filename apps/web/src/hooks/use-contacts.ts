import { useQuery } from "@tanstack/react-query";
import type { PaginatedResponse, Contact } from "@electragram/types";
import { useAuthStore } from "@/stores/auth.store";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "/api";

async function fetchContacts(
  accessToken: string
): Promise<PaginatedResponse<Contact>> {
  const res = await fetch(`${API_URL}/contacts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch contacts");
  const { data } = await res.json() as { data: PaginatedResponse<Contact> };
  return data;
}

export function useContacts(page = 1) {
  const tokens = useAuthStore((s) => s.tokens);
  return useQuery({
    queryKey: ["contacts", page],
    queryFn: () => fetchContacts(tokens!.accessToken),
    enabled: !!tokens,
  });
}
