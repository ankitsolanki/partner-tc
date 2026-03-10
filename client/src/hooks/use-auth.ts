import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import type { PartnerUser } from "@shared/schema";

export function usePartnerAuth() {
  const { data: user, isLoading } = useQuery<PartnerUser | null>({
    queryKey: ["/api/partner/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
  };
}

export function useAdminAuth() {
  const { data: user, isLoading } = useQuery<PartnerUser | null>({
    queryKey: ["/api/admin/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
  };
}

export function usePartnerLogout() {
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/partner/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/partner/auth/me"] });
    },
  });
}

export function useAdminLogout() {
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/auth/logout"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auth/me"] });
    },
  });
}
