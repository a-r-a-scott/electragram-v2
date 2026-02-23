import { useQuery } from "@tanstack/react-query";

import type { PaginatedResponse, Contact } from "@electragram/types";

import { useAuthStore } from "../stores/auth.store";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "https://api.electragram.com";

async function fetchContacts(
  accessToken: string,
  page: number
): Promise<PaginatedResponse<Contact>> {
  const res = await fetch(`${API_URL}/contacts?page=${page}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch contacts");
  const { data } = (await res.json()) as { data: PaginatedResponse<Contact> };
  return data;
}

export function useContacts(page = 1) {
  const tokens = useAuthStore((s) => s.tokens);
  return useQuery({
    queryKey: ["contacts", page],
    queryFn: () => fetchContacts(tokens!.accessToken, page),
    enabled: !!tokens,
  });
}
