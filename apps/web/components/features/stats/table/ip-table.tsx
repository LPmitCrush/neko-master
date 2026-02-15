"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Rows3,
  Globe,
  Server,
  ChevronDown,
  ChevronUp,
  Link2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InsightTableSkeleton } from "@/components/ui/insight-skeleton";
import { CountryFlag } from "@/components/features/countries/country-flag";
import { formatBytes, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { IPExpandedDetails } from "@/components/features/stats/table/expanded-details";
import { ProxyChainBadge } from "@/components/features/proxies/proxy-chain-badge";
import { IPPreview } from "@/components/features/stats/table/ip-preview";
import { ExpandReveal } from "@/components/ui/expand-reveal";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { IPStats, StatsSummary } from "@neko-master/shared";
import { api, type TimeRange } from "@/lib/api";
import { useStableTimeRange } from "@/lib/hooks/use-stable-time-range";
import { useStatsWebSocket } from "@/lib/websocket";
import {
  getIPDomainDetailsQueryKey,
  getIPProxyStatsQueryKey,
  getIPsQueryKey,
} from "@/lib/stats-query-keys";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface IPsTableProps {
  activeBackendId?: number;
  timeRange?: TimeRange;
  autoRefresh?: boolean;
  pageSize?: PageSize;
  onPageSizeChange?: (size: PageSize) => void;
}

type SortKey =
  | "ip"
  | "totalDownload"
  | "totalUpload"
  | "totalConnections"
  | "lastSeen";
type SortOrder = "asc" | "desc";

import { PAGE_SIZE_OPTIONS, type PageSize } from "@/lib/stats-utils";
const DETAIL_QUERY_STALE_MS = 30_000;
const IPS_WS_MIN_PUSH_MS = 3_000;
type IPsPageQueryState = {
  offset: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
};
type IPsPageState = {
  data: IPStats[];
  total: number;
  query: IPsPageQueryState;
  backendId?: number;
};

// Color palette for IP icons - solid colors that work in both light/dark modes
const IP_COLORS = [
  { bg: "bg-blue-500", text: "text-white" },
  { bg: "bg-violet-500", text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-amber-500", text: "text-white" },
  { bg: "bg-rose-500", text: "text-white" },
  { bg: "bg-cyan-500", text: "text-white" },
  { bg: "bg-indigo-500", text: "text-white" },
  { bg: "bg-teal-500", text: "text-white" },
];

// Get color for IP
const getIPColor = (ip: string) => {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ip.charCodeAt(i) + ((hash << 5) - hash);
  }
  return IP_COLORS[Math.abs(hash) % IP_COLORS.length];
};

export function IPsTable({
  activeBackendId,
  timeRange,
  autoRefresh = true,
  pageSize: controlledPageSize,
  onPageSizeChange,
}: IPsTableProps) {
  const t = useTranslations("ips");
  const stableTimeRange = useStableTimeRange(timeRange);
  const detailTimeRange = stableTimeRange;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalDownload");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState<PageSize>(10);
  const pageSize = controlledPageSize ?? internalPageSize;
  const setEffectivePageSize = useCallback((size: PageSize) => {
    if (onPageSizeChange) {
      onPageSizeChange(size);
      return;
    }
    setInternalPageSize(size);
  }, [onPageSizeChange]);
  const [expandedIP, setExpandedIP] = useState<string | null>(null);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [mobileDetailIP, setMobileDetailIP] = useState<IPStats | null>(null);
  const [wsIPsPage, setWsIPsPage] = useState<IPsPageState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageOffset = (currentPage - 1) * pageSize;
  const wsPageSearch = debouncedSearch || undefined;

  const wsPageEnabled = autoRefresh && !!activeBackendId;
  const { status: wsPageStatus } = useStatsWebSocket({
    backendId: activeBackendId,
    range: stableTimeRange,
    minPushIntervalMs: IPS_WS_MIN_PUSH_MS,
    includeIPsPage: wsPageEnabled,
    ipsPageOffset: pageOffset,
    ipsPageLimit: pageSize,
    ipsPageSortBy: sortKey,
    ipsPageSortOrder: sortOrder,
    ipsPageSearch: wsPageSearch,
    trackLastMessage: false,
    enabled: wsPageEnabled,
    onMessage: useCallback((stats: StatsSummary) => {
      const query = stats.ipsPageQuery;
      const page = stats.ipsPage;
      if (!page || !query) return;
      setWsIPsPage({
        data: page.data,
        total: page.total,
        query: {
          offset: query.offset,
          limit: query.limit,
          sortBy: query.sortBy || "totalDownload",
          sortOrder: query.sortOrder === "asc" ? "asc" : "desc",
          search: query.search || undefined,
        },
        backendId: activeBackendId,
      });
    }, [activeBackendId]),
  });

  const wsIPsPageMatchesCurrent =
    wsIPsPage !== null &&
    wsIPsPage.backendId === activeBackendId &&
    wsIPsPage.query.offset === pageOffset &&
    wsIPsPage.query.limit === pageSize &&
    (wsIPsPage.query.sortBy || "totalDownload") === sortKey &&
    (wsIPsPage.query.sortOrder || "desc") === sortOrder &&
    (wsIPsPage.query.search || undefined) === wsPageSearch;

  // Debounce search input
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const ipsQuery = useQuery({
    queryKey: getIPsQueryKey(
      activeBackendId,
      {
        offset: (currentPage - 1) * pageSize,
        limit: pageSize,
        sortBy: sortKey,
        sortOrder,
        search: debouncedSearch || undefined,
      },
      stableTimeRange,
    ),
    queryFn: () =>
      api.getIPs(activeBackendId, {
        offset: (currentPage - 1) * pageSize,
        limit: pageSize,
        sortBy: sortKey,
        sortOrder,
        search: debouncedSearch || undefined,
        start: stableTimeRange?.start,
        end: stableTimeRange?.end,
      }),
    enabled:
      !!activeBackendId &&
      (!wsPageEnabled || wsPageStatus !== "connected" || !wsIPsPageMatchesCurrent),
    placeholderData: keepPreviousData,
  });

  const hasWsIPsPage =
    wsPageEnabled && wsPageStatus === "connected" && wsIPsPageMatchesCurrent;
  const data = hasWsIPsPage ? wsIPsPage!.data : ipsQuery.data?.data ?? [];
  const total = hasWsIPsPage ? wsIPsPage!.total : ipsQuery.data?.total ?? 0;
  const loading = !hasWsIPsPage && ipsQuery.isLoading && !ipsQuery.data;
  const detailIPKey = mobileDetailsOpen ? (mobileDetailIP?.ip ?? null) : expandedIP;

  useEffect(() => {
    // Backend switch means a different data universe, collapse safely.
    setExpandedIP(null);
    setMobileDetailsOpen(false);
    setMobileDetailIP(null);
  }, [activeBackendId]);

  const expandedIPProxyQuery = useQuery({
    queryKey: getIPProxyStatsQueryKey(detailIPKey, activeBackendId, detailTimeRange),
    queryFn: () => api.getIPProxyStats(detailIPKey!, activeBackendId, detailTimeRange),
    enabled: !!activeBackendId && !!detailIPKey,
    staleTime: DETAIL_QUERY_STALE_MS,
    placeholderData: (previousData, previousQuery) => {
      const prevKey = (previousQuery?.queryKey?.[2] ?? null) as
        | { ip?: string; backendId?: number | null }
        | null;
      if (!prevKey) return undefined;
      if (prevKey.ip !== (detailIPKey ?? "")) return undefined;
      if (prevKey.backendId !== (activeBackendId ?? null)) return undefined;
      return previousData;
    },
  });

  const expandedIPDomainDetailsQuery = useQuery({
    queryKey: getIPDomainDetailsQueryKey(detailIPKey, activeBackendId, detailTimeRange),
    queryFn: () => api.getIPDomainDetails(detailIPKey!, activeBackendId, detailTimeRange),
    enabled: !!activeBackendId && !!detailIPKey,
    staleTime: DETAIL_QUERY_STALE_MS,
    placeholderData: (previousData, previousQuery) => {
      const prevKey = (previousQuery?.queryKey?.[2] ?? null) as
        | { ip?: string; backendId?: number | null }
        | null;
      if (!prevKey) return undefined;
      if (prevKey.ip !== (detailIPKey ?? "")) return undefined;
      if (prevKey.backendId !== (activeBackendId ?? null)) return undefined;
      return previousData;
    },
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);

  const handleSearchChange = (value: string) => {
    setSearch(value);
  };

  const handlePageSizeChange = (size: PageSize) => {
    setEffectivePageSize(size);
    setCurrentPage(1);
  };

  const toggleExpand = (ip: string) => {
    const newExpanded = expandedIP === ip ? null : ip;
    setExpandedIP(newExpanded);
  };

  const openMobileDetails = (ip: IPStats) => {
    setMobileDetailIP(ip);
    setMobileDetailsOpen(true);
  };

  const handleMobileDetailsOpenChange = (open: boolean) => {
    setMobileDetailsOpen(open);
    if (!open) {
      setMobileDetailIP(null);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column)
      return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary" />
    );
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push("...");
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden overflow-x-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-border/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{t("title")}</h3>
            <p className="text-sm text-muted-foreground">
              {total} {t("ipsCount")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("search")}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 h-10 w-full sm:w-[240px] bg-secondary/50 border-0"
            />
          </div>
        </div>
      </div>

      {/* Desktop Table Header */}
      <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-secondary/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <div
          className="col-span-3 flex items-center cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort("ip")}>
          {t("ipAddress")}
          <SortIcon column="ip" />
        </div>
        <div className="col-span-2 flex items-center">{t("proxy")}</div>
        <div className="col-span-2 flex items-center">{t("location")}</div>
        <div
          className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort("totalDownload")}>
          {t("download")}
          <SortIcon column="totalDownload" />
        </div>
        <div
          className="col-span-1 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort("totalUpload")}>
          {t("upload")}
          <SortIcon column="totalUpload" />
        </div>
        <div
          className="col-span-1 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort("totalConnections")}>
          {t("conn")}
          <SortIcon column="totalConnections" />
        </div>
        <div className="col-span-1 flex items-center justify-end">
          {t("domainCount")}
        </div>
      </div>

      {/* Mobile Sort Bar */}
      <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-secondary/30 overflow-x-auto scrollbar-hide">
        {[
          { key: "ip" as SortKey, label: t("ipAddress") },
          { key: "totalDownload" as SortKey, label: t("download") },
          { key: "totalUpload" as SortKey, label: t("upload") },
          { key: "totalConnections" as SortKey, label: t("conn") },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={cn(
              "flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
              sortKey === key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => handleSort(key)}>
            {label}
            {sortKey === key &&
              (sortOrder === "asc" ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              ))}
          </button>
        ))}
      </div>

      {/* Table Body */}
      <div className="divide-y divide-border/30 min-h-[300px]">
        {loading && data.length === 0 ? (
          <InsightTableSkeleton />
        ) : data.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground">
            {t("noResults")}
          </div>
        ) : (
          data.map((ip, index) => {
            const ipColor = getIPColor(ip.ip);
            const isDesktopExpanded = expandedIP === ip.ip;
            const isMobileActive = mobileDetailsOpen && mobileDetailIP?.ip === ip.ip;

            return (
              <div key={ip.ip} className="group">
                {/* Desktop Row */}
                <div
                  className={cn(
                    "hidden sm:grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-secondary/20 transition-colors cursor-pointer min-w-0",
                    isDesktopExpanded && "bg-secondary/10",
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => toggleExpand(ip.ip)}>
                  {/* IP with Icon */}
                  <div className="col-span-3 flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md ${ipColor.bg} ${ipColor.text} flex items-center justify-center shrink-0`}>
                      <Server className="w-3 h-3" />
                    </div>
                    <IPPreview
                      ip={ip.ip}
                      geoIP={ip.geoIP}
                      asn={ip.asn}
                      unknownLabel={t("unknownIP")}
                      unavailableLabel={t("unknown")}
                      copyLabel={t("copyIP")}
                      copiedLabel={t("copied")}
                      locationLabel={t("location")}
                      cityLabel={t("city")}
                      asnLabel={t("asn")}
                      asOrganizationLabel={t("asOrganization")}
                      className="flex-1"
                      triggerClassName="font-mono font-medium"
                    />
                  </div>

                  {/* Proxy */}
                  <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                    <ProxyChainBadge chains={ip.chains} />
                  </div>

                  {/* Location */}
                  <div className="col-span-2 flex items-center min-w-0">
                    {ip.geoIP && ip.geoIP.length > 0 ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CountryFlag country={ip.geoIP[0]} className="h-3.5 w-5" title={ip.geoIP[1] || ip.geoIP[0]} />
                        <span className="text-xs whitespace-nowrap">
                          {ip.geoIP[1] || ip.geoIP[0]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>

                  {/* Download */}
                  <div className="col-span-2 text-right tabular-nums text-sm whitespace-nowrap">
                    <span className="text-blue-500">
                      {formatBytes(ip.totalDownload)}
                    </span>
                  </div>

                  {/* Upload */}
                  <div className="col-span-1 text-right tabular-nums text-sm whitespace-nowrap">
                    <span className="text-purple-500">
                      {formatBytes(ip.totalUpload)}
                    </span>
                  </div>

                  {/* Connections */}
                  <div className="col-span-1 flex items-center justify-end">
                    <span className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium">
                      {formatNumber(ip.totalConnections)}
                    </span>
                  </div>

                  {/* Domains Count - Clickable */}
                  <div className="col-span-1 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 gap-1 text-xs font-medium transition-all",
                        isDesktopExpanded
                          ? "bg-primary/10 text-primary hover:bg-primary/20"
                          : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(ip.ip);
                      }}>
                      <Link2 className="h-3 w-3" />
                      {ip.domains.length}
                      {isDesktopExpanded ? (
                        <ChevronUp className="h-3 w-3 ml-0.5" />
                      ) : (
                        <ChevronDown className="h-3 w-3 ml-0.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Mobile Row - Card-style layout */}
                <div
                  className={cn(
                    "sm:hidden px-4 py-3 hover:bg-secondary/20 transition-colors cursor-pointer",
                    isMobileActive && "bg-secondary/10",
                  )}
                  onClick={() => openMobileDetails(ip)}>
                  {/* Row 1: IP Icon + IP (truncate) + Domain Count */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div
                      className={`w-5 h-5 rounded-md ${ipColor.bg} ${ipColor.text} flex items-center justify-center shrink-0`}>
                      <Server className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <IPPreview
                        ip={ip.ip}
                        geoIP={ip.geoIP}
                        asn={ip.asn}
                        unknownLabel={t("unknownIP")}
                        unavailableLabel={t("unknown")}
                        copyLabel={t("copyIP")}
                        copiedLabel={t("copied")}
                        locationLabel={t("location")}
                        cityLabel={t("city")}
                        asnLabel={t("asn")}
                        asOrganizationLabel={t("asOrganization")}
                        triggerClassName="font-mono font-medium"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 gap-1 text-xs font-medium shrink-0",
                        isMobileActive
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary/50 text-muted-foreground",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        openMobileDetails(ip);
                      }}>
                      <Link2 className="h-3 w-3" />
                      {ip.domains.length}
                      {isMobileActive ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </Button>
                  </div>

                  {/* Row 2: Location + Proxy tag */}
                  <div className="flex items-center gap-2 mb-2 pl-[30px] flex-wrap">
                    {ip.geoIP && ip.geoIP.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CountryFlag country={ip.geoIP[0]} className="h-3.5 w-5" />
                        <span className="truncate">
                          {ip.geoIP[1] || ip.geoIP[0]}
                        </span>
                      </span>
                    )}
                    {ip.chains && ip.chains.length > 0 && (
                      <ProxyChainBadge chains={ip.chains} truncateLabel={false} />
                    )}
                  </div>

                  {/* Row 3: Traffic stats - compact layout */}
                  <div className="flex items-center gap-3 text-[11px] pl-[30px]">
                    <span className="text-blue-500 tabular-nums whitespace-nowrap">
                      ↓ {formatBytes(ip.totalDownload)}
                    </span>
                    <span className="text-purple-500 tabular-nums whitespace-nowrap">
                      ↑ {formatBytes(ip.totalUpload)}
                    </span>
                    <span className="text-muted-foreground tabular-nums ml-auto">
                      {formatNumber(ip.totalConnections)} {t("conn")}
                    </span>
                  </div>
                </div>

                {/* Expanded Details: Proxy Traffic + Domains List */}
                {isDesktopExpanded && (
                  <div className="hidden sm:block">
                    <ExpandReveal>
                      <IPExpandedDetails
                        ip={ip}
                        proxyStats={expandedIPProxyQuery.data ?? []}
                        proxyStatsLoading={
                          expandedIPProxyQuery.isLoading &&
                          !expandedIPProxyQuery.data
                        }
                        domainDetails={expandedIPDomainDetailsQuery.data ?? []}
                        domainDetailsLoading={
                          expandedIPDomainDetailsQuery.isLoading &&
                          !expandedIPDomainDetailsQuery.data
                        }
                      associatedDomainsIcon="link"
                      labels={{
                        proxyTraffic: t("proxyTraffic"),
                        associatedDomains: t("associatedDomains"),
                        conn: t("conn"),
                      }}
                    />
                    </ExpandReveal>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <Drawer open={mobileDetailsOpen} onOpenChange={handleMobileDetailsOpenChange}>
        <DrawerContent className="sm:hidden">
          <DrawerHeader className="border-b border-border/60 px-4 py-2">
            <DrawerTitle className="truncate text-left text-sm font-semibold">
              {mobileDetailIP?.ip || t("unknownIP")}
            </DrawerTitle>
          </DrawerHeader>
          <div className="max-h-[76vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),0px)]">
            {mobileDetailIP ? (
              <IPExpandedDetails
                ip={mobileDetailIP}
                proxyStats={expandedIPProxyQuery.data ?? []}
                proxyStatsLoading={
                  expandedIPProxyQuery.isLoading &&
                  !expandedIPProxyQuery.data
                }
                domainDetails={expandedIPDomainDetailsQuery.data ?? []}
                domainDetailsLoading={
                  expandedIPDomainDetailsQuery.isLoading &&
                  !expandedIPDomainDetailsQuery.data
                }
                associatedDomainsIcon="link"
                labels={{
                  proxyTraffic: t("proxyTraffic"),
                  associatedDomains: t("associatedDomains"),
                  conn: t("conn"),
                }}
              />
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Pagination Footer */}
      {totalPages > 0 && (
        <div className="p-3 sm:p-4 border-t border-border/50 bg-secondary/20">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Page size selector */}
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                    <Rows3 className="h-4 w-4" />
                    <span>
                      {pageSize} / {t("page")}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <DropdownMenuItem
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={pageSize === size ? "bg-primary/10" : ""}>
                      {size} / {t("page")}
                    </DropdownMenuItem>
                  ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

            {/* Pagination info and controls */}
            <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-3">
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block whitespace-nowrap shrink-0">
                {t("showing")}{" "}
                {Math.min((currentPage - 1) * pageSize + 1, total)} -{" "}
                {Math.min(currentPage * pageSize, total)} {t("of")} {total}
              </p>
              <p className="text-xs text-muted-foreground sm:hidden whitespace-nowrap shrink-0">
                {Math.min((currentPage - 1) * pageSize + 1, total)}-
                {Math.min(currentPage * pageSize, total)} / {total}
              </p>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {getPageNumbers().map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1 sm:px-2 text-muted-foreground text-xs">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "ghost"}
                      size="sm"
                      className="h-8 w-8 px-0 text-xs"
                      onClick={() => setCurrentPage(page as number)}>
                      {page}
                    </Button>
                  ),
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
