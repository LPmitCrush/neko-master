"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, ArrowUpDown, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Rows3, Globe, Server, ChevronDown, ChevronUp, Link2, Waypoints, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatBytes, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { IPStats, ProxyTrafficStats } from "@clashmaster/shared";
import { api } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface IPsTableProps {
  data: IPStats[];
}

type SortKey = "ip" | "totalDownload" | "totalUpload" | "totalConnections" | "lastSeen";
type SortOrder = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];

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

// Get color for domain
const getDomainColor = (domain: string) => {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return IP_COLORS[Math.abs(hash) % IP_COLORS.length];
};

// Country flag emoji mapping
const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸", CN: "🇨🇳", JP: "🇯🇵", SG: "🇸🇬", HK: "🇭🇰",
  TW: "🇹🇼", KR: "🇰🇷", GB: "🇬🇧", DE: "🇩🇪", FR: "🇫🇷",
  NL: "🇳🇱", CA: "🇨🇦", AU: "🇦🇺", IN: "🇮🇳", BR: "🇧🇷",
  RU: "🇷🇺", SE: "🇸🇪", CH: "🇨🇭", IL: "🇮🇱", ID: "🇮🇩",
  LOCAL: "🏠",
};

function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[country] || COUNTRY_FLAGS[country.toUpperCase()] || "🌐";
}

export function IPsTable({ data }: IPsTableProps) {
  const t = useTranslations("ips");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalDownload");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [expandedIP, setExpandedIP] = useState<string | null>(null);
  const [proxyStats, setProxyStats] = useState<Record<string, ProxyTrafficStats[]>>({});
  const [proxyStatsLoading, setProxyStatsLoading] = useState<string | null>(null);

  // Fetch proxy stats when an IP is expanded
  const fetchProxyStats = useCallback(async (ip: string) => {
    if (proxyStats[ip]) return; // Already cached
    setProxyStatsLoading(ip);
    try {
      const stats = await api.getIPProxyStats(ip);
      setProxyStats(prev => ({ ...prev, [ip]: stats }));
    } catch (err) {
      console.error(`Failed to fetch proxy stats for ${ip}:`, err);
      setProxyStats(prev => ({ ...prev, [ip]: [] }));
    } finally {
      setProxyStatsLoading(null);
    }
  }, [proxyStats]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const filteredData = useMemo(() => {
    return (data || [])
      .filter((ip) =>
        ip.ip.toLowerCase().includes(search.toLowerCase()) ||
        ip.domains.some((d) => d.toLowerCase().includes(search.toLowerCase()))
      )
      .sort((a, b) => {
        const aValue = a[sortKey];
        const bValue = b[sortKey];
        const modifier = sortOrder === "asc" ? 1 : -1;
        
        if (typeof aValue === "string" && typeof bValue === "string") {
          return aValue.localeCompare(bValue) * modifier;
        }
        return ((aValue as number) - (bValue as number)) * modifier;
      });
  }, [data, search, sortKey, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (size: PageSize) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const toggleExpand = (ip: string) => {
    const newExpanded = expandedIP === ip ? null : ip;
    setExpandedIP(newExpanded);
    if (newExpanded) {
      fetchProxyStats(newExpanded);
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
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
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
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
              {filteredData.length} {t("ipsCount")}
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
          onClick={() => handleSort("ip")}
        >
          {t("ipAddress")}
          <SortIcon column="ip" />
        </div>
        <div className="col-span-2 flex items-center">
          {t("proxy")}
        </div>
        <div className="col-span-1 flex items-center">
          {t("location")}
        </div>
        <div 
          className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort("totalDownload")}
        >
          {t("download")}
          <SortIcon column="totalDownload" />
        </div>
        <div 
          className="col-span-1 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort("totalUpload")}
        >
          {t("upload")}
          <SortIcon column="totalUpload" />
        </div>
        <div className="col-span-1 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
          onClick={() => handleSort("totalConnections")}
        >
          {t("conn")}
          <SortIcon column="totalConnections" />
        </div>
        <div className="col-span-2 flex items-center justify-end">
          {t("domainCount")}
        </div>
      </div>

      {/* Mobile Sort Bar */}
      <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-secondary/30 overflow-x-auto scrollbar-hide">
        {([
          { key: "ip" as SortKey, label: t("ipAddress") },
          { key: "totalDownload" as SortKey, label: t("download") },
          { key: "totalUpload" as SortKey, label: t("upload") },
          { key: "totalConnections" as SortKey, label: t("conn") },
        ]).map(({ key, label }) => (
          <button
            key={key}
            className={cn(
              "flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
              sortKey === key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => handleSort(key)}
          >
            {label}
            {sortKey === key && (
              sortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
            )}
          </button>
        ))}
      </div>

      {/* Table Body */}
      <div className="divide-y divide-border/30 min-h-[300px]">
        {paginatedData.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted-foreground">
            {t("noResults")}
          </div>
        ) : (
          paginatedData.map((ip, index) => {
            const ipColor = getIPColor(ip.ip);
            const isExpanded = expandedIP === ip.ip;
            
            return (
              <div key={ip.ip} className="group">
                {/* Desktop Row */}
                <div
                  className={cn(
                    "hidden sm:grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-secondary/20 transition-colors cursor-pointer min-w-0",
                    isExpanded && "bg-secondary/10"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => toggleExpand(ip.ip)}
                >
                  {/* IP with Icon */}
                  <div className="col-span-3 flex items-center gap-3 min-w-0">
                    <div className={`w-5 h-5 rounded-md ${ipColor.bg} ${ipColor.text} flex items-center justify-center shrink-0`}>
                      <Server className="w-3 h-3" />
                    </div>
                    <div className="min-w-0">
                      <code className="text-sm font-medium truncate block">{ip.ip}</code>
                    </div>
                  </div>

                  {/* Proxy */}
                  <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                    {ip.chains && ip.chains.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[11px] font-medium truncate max-w-[120px]"
                          title={ip.chains[0]}
                        >
                          <Waypoints className="h-2.5 w-2.5 shrink-0" />
                          {ip.chains[0]}
                        </span>
                        {ip.chains.length > 1 && (
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            +{ip.chains.length - 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>

                  {/* Location */}
                  <div className="col-span-1 flex items-center">
                    {ip.geoIP && ip.geoIP.length > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm" title={ip.geoIP[1] || ip.geoIP[0]}>
                          {getCountryFlag(ip.geoIP[0])}
                        </span>
                        <span className="text-xs truncate">{ip.geoIP[1] || ip.geoIP[0]}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </div>

                  {/* Download */}
                  <div className="col-span-2 text-right tabular-nums text-sm">
                    <span className="text-blue-500">{formatBytes(ip.totalDownload)}</span>
                  </div>

                  {/* Upload */}
                  <div className="col-span-1 text-right tabular-nums text-sm">
                    <span className="text-purple-500">{formatBytes(ip.totalUpload)}</span>
                  </div>

                  {/* Connections */}
                  <div className="col-span-1 flex items-center justify-end">
                    <span className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium">
                      {formatNumber(ip.totalConnections)}
                    </span>
                  </div>

                  {/* Domains Count - Clickable */}
                  <div className="col-span-2 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 gap-1 text-xs font-medium transition-all",
                        isExpanded 
                          ? "bg-primary/10 text-primary hover:bg-primary/20" 
                          : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(ip.ip);
                      }}
                    >
                      <Link2 className="h-3 w-3" />
                      {ip.domains.length}
                      {isExpanded ? (
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
                    isExpanded && "bg-secondary/10"
                  )}
                  onClick={() => toggleExpand(ip.ip)}
                >
                  {/* Row 1: IP Icon + IP (truncate) + Domain Count */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-5 h-5 rounded-md ${ipColor.bg} ${ipColor.text} flex items-center justify-center shrink-0`}>
                      <Server className="w-3 h-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <code className="text-sm font-medium truncate block">{ip.ip}</code>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 gap-1 text-xs font-medium shrink-0",
                        isExpanded 
                          ? "bg-primary/10 text-primary" 
                          : "bg-secondary/50 text-muted-foreground"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(ip.ip);
                      }}
                    >
                      <Link2 className="h-3 w-3" />
                      {ip.domains.length}
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </Button>
                  </div>

                  {/* Row 2: Location + Proxy tag */}
                  <div className="flex items-center gap-2 mb-2 pl-[30px] flex-wrap">
                    {ip.geoIP && ip.geoIP.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span>{getCountryFlag(ip.geoIP[0])}</span>
                        <span className="truncate">{ip.geoIP[1] || ip.geoIP[0]}</span>
                      </span>
                    )}
                    {ip.chains && ip.chains.length > 0 && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[11px] font-medium whitespace-nowrap"
                        title={ip.chains[0]}
                      >
                        <Waypoints className="h-2.5 w-2.5 shrink-0" />
                        {ip.chains[0]}
                      </span>
                    )}
                    {ip.chains && ip.chains.length > 1 && (
                      <span className="text-[11px] text-muted-foreground">
                        +{ip.chains.length - 1}
                      </span>
                    )}
                  </div>

                  {/* Row 3: Traffic stats - compact layout */}
                  <div className="flex items-center gap-3 text-[11px] pl-[30px]">
                    <span className="text-blue-500 tabular-nums">↓ {formatBytes(ip.totalDownload)}</span>
                    <span className="text-purple-500 tabular-nums">↑ {formatBytes(ip.totalUpload)}</span>
                    <span className="text-muted-foreground tabular-nums ml-auto">
                      {formatNumber(ip.totalConnections)} {t("conn")}
                    </span>
                  </div>
                </div>

                {/* Expanded Details: Proxy Traffic + Domains List */}
                {isExpanded && (
                  <div className="px-4 sm:px-5 pb-4 bg-secondary/5">
                    <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Proxy Traffic Breakdown */}
                      <div className="px-1">
                        <p className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                          <Waypoints className="h-3 w-3" />
                          {t("proxyTraffic")}
                        </p>
                        {proxyStatsLoading === ip.ip ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (proxyStats[ip.ip] && proxyStats[ip.ip].length > 0) ? (
                          <div className="space-y-2">
                            {proxyStats[ip.ip].map((ps) => {
                              const totalTraffic = ip.totalDownload + ip.totalUpload;
                              const proxyTraffic = ps.totalDownload + ps.totalUpload;
                              const percent = totalTraffic > 0 ? (proxyTraffic / totalTraffic) * 100 : 0;
                              const proxyTotal = ps.totalDownload + ps.totalUpload;
                              const downloadPercent = proxyTotal > 0 ? (ps.totalDownload / proxyTotal) * 100 : 0;
                              const uploadPercent = proxyTotal > 0 ? (ps.totalUpload / proxyTotal) * 100 : 0;
                              return (
                                <div
                                  key={ps.chain}
                                  className="px-3 py-2 rounded-lg bg-card border border-border/50"
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-medium truncate max-w-[60%]" title={ps.chain}>
                                      <Waypoints className="h-3 w-3 text-orange-500 shrink-0" />
                                      {ps.chain}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                                      {percent.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full bg-secondary/80 mb-1.5 overflow-hidden flex">
                                    <div
                                      className="h-full bg-blue-500 transition-all"
                                      style={{ width: `${Math.max(percent * (downloadPercent / 100), 0.5)}%` }}
                                    />
                                    <div
                                      className="h-full bg-purple-500 transition-all"
                                      style={{ width: `${Math.max(percent * (uploadPercent / 100), 0.5)}%` }}
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] tabular-nums">
                                    <span className="text-blue-500">↓ {formatBytes(ps.totalDownload)}</span>
                                    <span className="text-purple-500">↑ {formatBytes(ps.totalUpload)}</span>
                                    <span className="text-muted-foreground">{formatNumber(ps.totalConnections)} {t("conn")}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (ip.chains && ip.chains.length > 0) ? (
                          <div className="flex flex-wrap gap-1.5">
                            {ip.chains.map((chain) => (
                              <span
                                key={chain}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-medium max-w-full min-w-0"
                                title={chain}
                              >
                                <Waypoints className="h-3 w-3 shrink-0" />
                                <span className="truncate min-w-0">
                                  {chain}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>

                      {/* Associated Domains */}
                      <div className="px-1">
                        <p className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                          <Link2 className="h-3 w-3" />
                          {t("associatedDomains")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {ip.domains.map((domain) => {
                            const domainColor = getDomainColor(domain);
                            return (
                              <div
                                key={domain}
                                className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all"
                              >
                                <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md ${domainColor.bg} ${domainColor.text} flex items-center justify-center shrink-0`}>
                                  <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </div>
                                <span className="text-xs font-medium truncate max-w-[180px] sm:max-w-[200px]">{domain}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 0 && (
        <div className="p-3 sm:p-4 border-t border-border/50 bg-secondary/20">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Page size selector */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                    <Rows3 className="h-4 w-4" />
                    <span>{pageSize} / {t("page")}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <DropdownMenuItem
                      key={size}
                      onClick={() => handlePageSizeChange(size)}
                      className={pageSize === size ? "bg-primary/10" : ""}
                    >
                      {size} / {t("page")}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="text-sm text-muted-foreground">
                {t("total")} {filteredData.length}
              </span>
            </div>
            
            {/* Pagination info and controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                {t("showing")} {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredData.length)} {t("of")} {filteredData.length}
              </p>
              <p className="text-xs text-muted-foreground sm:hidden">
                {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredData.length)} / {filteredData.length}
              </p>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {getPageNumbers().map((page, idx) => (
                  page === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 sm:px-2 text-muted-foreground text-xs">...</span>
                  ) : (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "ghost"}
                      size="sm"
                      className="h-8 w-8 px-0 text-xs"
                      onClick={() => setCurrentPage(page as number)}
                    >
                      {page}
                    </Button>
                  )
                ))}
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
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
