"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Server, ChevronLeft, ChevronRight, Loader2, BarChart3, Link2, Rows3, ArrowUpDown, ArrowDown, ArrowUp, Globe, Waypoints, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell as BarCell, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Favicon } from "@/components/favicon";
import type { ProxyStats, DomainStats, IPStats } from "@clashmaster/shared";

interface InteractiveProxyStatsProps {
  data: ProxyStats[];
  activeBackendId?: number;
}

const COLORS = [
  "#3B82F6", "#8B5CF6", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#EC4899", "#6366F1", "#14B8A6", "#F97316",
];

const CHART_COLORS = [
  "#3B82F6", "#8B5CF6", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#EC4899", "#6366F1", "#14B8A6", "#F97316",
];

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
type PageSize = typeof PAGE_SIZE_OPTIONS[number];

// Generate gradient based on IP - same as DomainsTable
const getIPGradient = (ip: string) => {
  const colors = [
    "from-emerald-500 to-teal-400",
    "from-blue-500 to-cyan-400",
    "from-violet-500 to-purple-400",
    "from-orange-500 to-amber-400",
    "from-rose-500 to-pink-400",
  ];
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ip.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Keep original proxy name - preserve emojis and special characters
function simplifyProxyName(name: string): string {
  if (!name) return "DIRECT";
  // Keep original name with emojis, just trim whitespace
  return name.trim();
}

// Get emoji for proxy
function getProxyEmoji(name: string): string {
  if (name.includes("🇺🇸")) return "🇺🇸";
  if (name.includes("🇯🇵")) return "🇯🇵";
  if (name.includes("🇸🇬")) return "🇸🇬";
  if (name.includes("🇭🇰")) return "🇭🇰";
  if (name.includes("🇹🇼")) return "🇹🇼";
  if (name.includes("🇰🇷")) return "🇰🇷";
  if (name === "DIRECT" || name === "Direct") return "🏠";
  return "🌐";
}

// Domain sort keys
type DomainSortKey = "domain" | "totalDownload" | "totalUpload" | "totalConnections";
type SortOrder = "asc" | "desc";

// IP sort keys
type IPSortKey = "ip" | "totalDownload" | "totalUpload" | "totalConnections";

// Color palette for icons
const ICON_COLORS = [
  { bg: "bg-blue-500", text: "text-white" },
  { bg: "bg-violet-500", text: "text-white" },
  { bg: "bg-emerald-500", text: "text-white" },
  { bg: "bg-amber-500", text: "text-white" },
  { bg: "bg-rose-500", text: "text-white" },
  { bg: "bg-cyan-500", text: "text-white" },
  { bg: "bg-indigo-500", text: "text-white" },
  { bg: "bg-teal-500", text: "text-white" },
];

const getDomainColor = (domain: string) => {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length];
};

const getIPColor = (ip: string) => {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ip.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length];
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

// Custom label renderer for bar chart
function renderCustomBarLabel(props: any) {
  const { x, y, width, value, height } = props;
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      fill="currentColor"
      fontSize={11}
      dominantBaseline="central"
      textAnchor="start"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {formatBytes(value, 0)}
    </text>
  );
}

export function InteractiveProxyStats({ data, activeBackendId }: InteractiveProxyStatsProps) {
  const t = useTranslations("proxies");
  const domainsT = useTranslations("domains");
  const ipsT = useTranslations("ips");
  
  const [selectedProxy, setSelectedProxy] = useState<string | null>(null);
  const [proxyDomains, setProxyDomains] = useState<DomainStats[]>([]);
  const [proxyIPs, setProxyIPs] = useState<IPStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("domains");
  
  // Pagination states
  const [domainPage, setDomainPage] = useState(1);
  const [domainPageSize, setDomainPageSize] = useState<PageSize>(10);
  const [domainSearch, setDomainSearch] = useState("");
  const [ipPage, setIpPage] = useState(1);
  const [ipPageSize, setIpPageSize] = useState<PageSize>(10);
  const [ipSearch, setIpSearch] = useState("");
  const [showDomainBarLabels, setShowDomainBarLabels] = useState(true);

  // Sort states
  const [domainSortKey, setDomainSortKey] = useState<DomainSortKey>("totalDownload");
  const [domainSortOrder, setDomainSortOrder] = useState<SortOrder>("desc");
  const [ipSortKey, setIpSortKey] = useState<IPSortKey>("totalDownload");
  const [ipSortOrder, setIpSortOrder] = useState<SortOrder>("desc");

  // Expanded states
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [expandedIP, setExpandedIP] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setShowDomainBarLabels(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.map((proxy, index) => ({
      name: simplifyProxyName(proxy.chain),
      rawName: proxy.chain,
      value: proxy.totalDownload + proxy.totalUpload,
      download: proxy.totalDownload,
      upload: proxy.totalUpload,
      connections: proxy.totalConnections,
      color: COLORS[index % COLORS.length],
      emoji: getProxyEmoji(proxy.chain),
      rank: index,
    }));
  }, [data]);

  const totalTraffic = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);

  const maxTotal = useMemo(() => {
    if (!chartData.length) return 1;
    return Math.max(...chartData.map(p => p.value));
  }, [chartData]);

  // Domain sort handler
  const handleDomainSort = (key: DomainSortKey) => {
    if (domainSortKey === key) {
      setDomainSortOrder(domainSortOrder === "asc" ? "desc" : "asc");
    } else {
      setDomainSortKey(key);
      setDomainSortOrder("desc");
    }
    setDomainPage(1);
  };

  // IP sort handler
  const handleIPSort = (key: IPSortKey) => {
    if (ipSortKey === key) {
      setIpSortOrder(ipSortOrder === "asc" ? "desc" : "asc");
    } else {
      setIpSortKey(key);
      setIpSortOrder("desc");
    }
    setIpPage(1);
  };

  // Toggle expand handlers
  const toggleExpandDomain = (domain: string) => {
    setExpandedDomain(expandedDomain === domain ? null : domain);
  };

  const toggleExpandIP = (ip: string) => {
    setExpandedIP(expandedIP === ip ? null : ip);
  };

  // Sort icon component
  const DomainSortIcon = ({ column }: { column: DomainSortKey }) => {
    if (domainSortKey !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    return domainSortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary" />
    );
  };

  const IPSortIcon = ({ column }: { column: IPSortKey }) => {
    if (ipSortKey !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground" />;
    return ipSortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3 text-primary" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-primary" />
    );
  };

  // Load proxy details
  const loadProxyDetails = useCallback(async (chain: string) => {
    setLoading(true);
    try {
      const [domains, ips] = await Promise.all([
        api.getProxyDomains(chain, activeBackendId),
        api.getProxyIPs(chain, activeBackendId),
      ]);
      setProxyDomains(domains);
      setProxyIPs(ips);
      // Reset pagination
      setDomainPage(1);
      setIpPage(1);
      setDomainSearch("");
      setIpSearch("");
    } catch (err) {
      console.error(`Failed to load details for ${chain}:`, err);
      setProxyDomains([]);
      setProxyIPs([]);
    } finally {
      setLoading(false);
    }
  }, [activeBackendId]);

  // Default select first proxy when data loads
  useEffect(() => {
    if (chartData.length > 0 && !selectedProxy) {
      const firstProxy = chartData[0].rawName;
      setSelectedProxy(firstProxy);
      loadProxyDetails(firstProxy);
    }
  }, [chartData, selectedProxy, loadProxyDetails]);

  const handleProxyClick = useCallback((chain: string) => {
    if (selectedProxy !== chain) {
      setSelectedProxy(chain);
      loadProxyDetails(chain);
    }
  }, [selectedProxy, loadProxyDetails]);

  const selectedProxyData = useMemo(() => {
    return chartData.find(p => p.rawName === selectedProxy);
  }, [chartData, selectedProxy]);

  // Filter, sort and paginate domains
  const filteredDomains = useMemo(() => {
    let result = proxyDomains;
    if (domainSearch) {
      result = proxyDomains.filter(d => 
        d.domain.toLowerCase().includes(domainSearch.toLowerCase())
      );
    }
    // Sort
    return [...result].sort((a, b) => {
      const aValue = a[domainSortKey];
      const bValue = b[domainSortKey];
      const modifier = domainSortOrder === "asc" ? 1 : -1;
      if (typeof aValue === "string" && typeof bValue === "string") {
        return aValue.localeCompare(bValue) * modifier;
      }
      return ((aValue as number) - (bValue as number)) * modifier;
    });
  }, [proxyDomains, domainSearch, domainSortKey, domainSortOrder]);

  const paginatedDomains = useMemo(() => {
    const start = (domainPage - 1) * domainPageSize;
    return filteredDomains.slice(start, start + domainPageSize);
  }, [filteredDomains, domainPage, domainPageSize]);

  const domainTotalPages = Math.ceil(filteredDomains.length / domainPageSize);

  // Filter, sort and paginate IPs
  const filteredIPs = useMemo(() => {
    let result = proxyIPs;
    if (ipSearch) {
      result = proxyIPs.filter(ip => 
        ip.ip.toLowerCase().includes(ipSearch.toLowerCase()) ||
        ip.domains.some(d => d.toLowerCase().includes(ipSearch.toLowerCase()))
      );
    }
    // Sort
    return [...result].sort((a, b) => {
      const aValue = a[ipSortKey];
      const bValue = b[ipSortKey];
      const modifier = ipSortOrder === "asc" ? 1 : -1;
      if (typeof aValue === "string" && typeof bValue === "string") {
        return aValue.localeCompare(bValue) * modifier;
      }
      return ((aValue as number) - (bValue as number)) * modifier;
    });
  }, [proxyIPs, ipSearch, ipSortKey, ipSortOrder]);

  const paginatedIPs = useMemo(() => {
    const start = (ipPage - 1) * ipPageSize;
    return filteredIPs.slice(start, start + ipPageSize);
  }, [filteredIPs, ipPage, ipPageSize]);

  const ipTotalPages = Math.ceil(filteredIPs.length / ipPageSize);

  // Chart data
  const domainChartData = useMemo(() => {
    if (!proxyDomains?.length) return [];
    return proxyDomains
      .slice(0, 10)
      .map((domain, index) => ({
        name: domain.domain.length > 15 ? domain.domain.slice(0, 15) + "..." : domain.domain,
        fullDomain: domain.domain,
        total: domain.totalDownload + domain.totalUpload,
        download: domain.totalDownload,
        upload: domain.totalUpload,
        connections: domain.totalConnections,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));
  }, [proxyDomains]);

  const getPageNumbers = (currentPage: number, totalPages: number) => {
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

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          {t("noData")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {/* Top Section: Three Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Pie Chart (3 columns) */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("distribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="bg-background border border-border p-3 rounded-lg shadow-lg">
                            <p className="font-medium text-sm mb-1">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{formatBytes(item.value)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Middle: Proxy List (4 columns) - Style like TopProxiesSimple */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("proxyNodes")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ScrollArea className="h-[280px] pr-3">
              <div className="space-y-2">
                {chartData.map((item) => {
                const percentage = totalTraffic > 0 ? (item.value / totalTraffic) * 100 : 0;
                const barPercent = (item.value / maxTotal) * 100;
                const isSelected = selectedProxy === item.rawName;
                
                // Badge color based on rank like TopProxiesSimple
                const badgeColor = item.rank === 0
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : item.rank === 1
                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  : item.rank === 2
                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  : "bg-muted text-muted-foreground";

                return (
                  <button
                    key={item.rawName}
                    onClick={() => handleProxyClick(item.rawName)}
                    className={cn(
                      "w-full p-2.5 rounded-xl border text-left transition-all duration-200",
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border/50 bg-card/50 hover:bg-card hover:border-primary/30"
                    )}>
                    {/* Row 1: Rank + Name + Total */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={cn(
                        "w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0",
                        badgeColor
                      )}>
                        {item.rank + 1}
                      </span>
                      
                      <span className="flex-1 text-sm font-medium truncate" title={item.name}>
                        {item.name}
                      </span>
                      
                      <span className="text-sm font-bold tabular-nums shrink-0">
                        {formatBytes(item.value)}
                      </span>
                    </div>

                    {/* Row 2: Progress bar + Stats */}
                    <div className="pl-7 space-y-1">
                      {/* Progress bar - dual color like TopProxiesSimple */}
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
                        <div 
                          className="h-full bg-blue-500 dark:bg-blue-400" 
                          style={{ width: `${(item.download / item.value) * barPercent}%` }}
                        />
                        <div 
                          className="h-full bg-purple-500 dark:bg-purple-400" 
                          style={{ width: `${(item.upload / item.value) * barPercent}%` }}
                        />
                      </div>
                      {/* Stats */}
                      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                          <span className="text-blue-500 dark:text-blue-400">↓ {formatBytes(item.download)}</span>
                          <span className="text-purple-500 dark:text-purple-400">↑ {formatBytes(item.upload)}</span>
                          <span className="flex items-center gap-1 tabular-nums">
                            <Link2 className="w-3 h-3" />
                            {formatNumber(item.connections)}
                          </span>
                        </div>
                        <span className="tabular-nums">{percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: Top Domains Chart (5 columns) */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                {t("topDomains")}
              </CardTitle>
              {selectedProxyData && (
                <span className="text-xs text-muted-foreground">
                  {selectedProxyData.name}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8 h-[280px]">
                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : domainChartData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground h-[280px] flex items-center justify-center">
                {domainsT("noResults")}
              </div>
            ) : (
              <div className="h-[280px] w-full min-w-0 overflow-hidden sm:overflow-visible">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={domainChartData}
                    layout="vertical"
                    margin={{ top: 5, right: showDomainBarLabels ? 50 : 10, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid 
                      strokeDasharray="3 3" 
                      stroke="#888888" 
                      opacity={0.2} 
                      horizontal={false} 
                    />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => formatBytes(value, 0)}
                      tick={{ fill: "#888888", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 10, fill: "currentColor" }}
                tickLine={false}
                axisLine={false}
              />
                    <RechartsTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload;
                          return (
                            <div className="bg-background border border-border p-3 rounded-lg shadow-lg min-w-[200px] max-w-[90vw] sm:min-w-[280px]">
                              <div className="flex items-center gap-2 mb-3">
                                <Favicon domain={item.fullDomain} size="sm" />
                                <span className="font-medium text-sm text-foreground truncate max-w-[200px]">
                                  {item.fullDomain}
                                </span>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground">Total Traffic</span>
                                  <span className="font-semibold text-foreground">{formatBytes(item.total)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-blue-500">Download</span>
                                  <span className="text-foreground">{formatBytes(item.download)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <span className="text-purple-500">Upload</span>
                                  <span className="text-foreground">{formatBytes(item.upload)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-border/50">
                                  <span className="text-emerald-500">Connections</span>
                                  <span className="text-foreground">{formatNumber(item.connections)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                      cursor={{ fill: "rgba(128, 128, 128, 0.1)" }} 
                    />
                    <Bar
                      dataKey="total"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={24}
                    >
                      {domainChartData.map((entry, index) => (
                        <BarCell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    {showDomainBarLabels && (
                      <LabelList
                        dataKey="total"
                        position="right"
                        content={renderCustomBarLabel}
                      />
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section: Domain List & IP Addresses with pagination */}
      {selectedProxy && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Simplified Tabs - no icons, no counts, like Domains page */}
          <TabsList className="glass">
            <TabsTrigger value="domains">
              {domainsT("domainList")}
            </TabsTrigger>
            <TabsTrigger value="ips">
              {ipsT("ipList")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="domains" className="mt-4">
            <Card>
              {/* Header with search */}
              <div className="p-4 border-b border-border/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{domainsT("associatedDomains")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {filteredDomains.length} {domainsT("domainsCount")}
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder={domainsT("search")}
                      value={domainSearch}
                      onChange={(e) => {
                        setDomainSearch(e.target.value);
                        setDomainPage(1);
                      }}
                      className="h-9 w-full sm:w-[240px] bg-secondary/50 border-0"
                    />
                  </div>
                </div>
              </div>

              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredDomains.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {domainSearch ? domainsT("noResults") : "No domains found"}
                  </div>
                ) : (
                  <>
                    {/* Desktop Table Header */}
                    <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-secondary/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <div 
                        className="col-span-4 flex items-center cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleDomainSort("domain")}
                      >
                        {domainsT("domain")}
                        <DomainSortIcon column="domain" />
                      </div>
                      <div 
                        className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleDomainSort("totalDownload")}
                      >
                        {domainsT("download")}
                        <DomainSortIcon column="totalDownload" />
                      </div>
                      <div 
                        className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleDomainSort("totalUpload")}
                      >
                        {domainsT("upload")}
                        <DomainSortIcon column="totalUpload" />
                      </div>
                      <div 
                        className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleDomainSort("totalConnections")}
                      >
                        {domainsT("conn")}
                        <DomainSortIcon column="totalConnections" />
                      </div>
                      <div className="col-span-2 flex items-center justify-end">
                        {domainsT("ipCount")}
                      </div>
                    </div>

                    {/* Mobile Sort Bar */}
                    <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-secondary/30 overflow-x-auto scrollbar-hide">
                      {([
                        { key: "domain" as DomainSortKey, label: domainsT("domain") },
                        { key: "totalDownload" as DomainSortKey, label: domainsT("download") },
                        { key: "totalUpload" as DomainSortKey, label: domainsT("upload") },
                        { key: "totalConnections" as DomainSortKey, label: domainsT("conn") },
                      ]).map(({ key, label }) => (
                        <button
                          key={key}
                          className={cn(
                            "flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                            domainSortKey === key
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => handleDomainSort(key)}
                        >
                          {label}
                          {domainSortKey === key && (
                            domainSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Domain List */}
                    <div className="divide-y divide-border/30">
                      {(() => {
                        const totalDomainTraffic = filteredDomains.reduce(
                          (sum, d) => sum + d.totalDownload + d.totalUpload, 0
                        );
                        return paginatedDomains.map((domain, index) => {
                          const domainTraffic = domain.totalDownload + domain.totalUpload;
                          const percent = totalDomainTraffic > 0 ? (domainTraffic / totalDomainTraffic) * 100 : 0;
                          const isExpanded = expandedDomain === domain.domain;
                          
                          return (
                            <div key={domain.domain} className="group">
                              {/* Desktop Row */}
                              <div
                                className={cn(
                                  "hidden sm:grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-secondary/20 transition-colors cursor-pointer",
                                  isExpanded && "bg-secondary/10"
                                )}
                                style={{ animationDelay: `${index * 50}ms` }}
                                onClick={() => toggleExpandDomain(domain.domain)}
                              >
                                {/* Domain with Favicon */}
                                <div className="col-span-4 flex items-center gap-3 min-w-0">
                                  <Favicon domain={domain.domain} size="sm" className="shrink-0" />
                                  <span className="font-medium text-sm truncate" title={domain.domain}>
                                    {domain.domain}
                                  </span>
                                </div>

                                {/* Download */}
                                <div className="col-span-2 text-right tabular-nums text-sm">
                                  <span className="text-blue-500">{formatBytes(domain.totalDownload)}</span>
                                </div>

                                {/* Upload */}
                                <div className="col-span-2 text-right tabular-nums text-sm">
                                  <span className="text-purple-500">{formatBytes(domain.totalUpload)}</span>
                                </div>

                                {/* Connections */}
                                <div className="col-span-2 flex items-center justify-end">
                                  <span className="px-2 py-0.5 rounded-full bg-secondary text-xs font-medium">
                                    {formatNumber(domain.totalConnections)}
                                  </span>
                                </div>

                                {/* IP Count - Clickable */}
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
                                      toggleExpandDomain(domain.domain);
                                    }}
                                  >
                                    <Server className="h-3 w-3" />
                                    {domain.ips.length}
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
                                onClick={() => toggleExpandDomain(domain.domain)}
                              >
                                {/* Top: Favicon + Domain + Expand */}
                                <div className="flex items-center gap-2.5 mb-2">
                                  <Favicon domain={domain.domain} size="sm" className="shrink-0" />
                                  <span className="font-medium text-sm truncate flex-1" title={domain.domain}>
                                    {domain.domain}
                                  </span>
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
                                      toggleExpandDomain(domain.domain);
                                    }}
                                  >
                                    <Server className="h-3 w-3" />
                                    {domain.ips.length}
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </Button>
                                </div>

                                {/* Bottom: Stats row */}
                                <div className="flex items-center justify-between text-xs pl-[30px]">
                                  <span className="text-blue-500 tabular-nums">↓ {formatBytes(domain.totalDownload)}</span>
                                  <span className="text-purple-500 tabular-nums">↑ {formatBytes(domain.totalUpload)}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                                    {formatNumber(domain.totalConnections)} {domainsT("conn")}
                                  </span>
                                </div>
                              </div>

                              {/* Expanded Details: Associated IPs */}
                              {isExpanded && (
                                <div className="px-4 sm:px-5 pb-4 bg-secondary/5">
                                  <div className="pt-3">
                                    {/* Associated IPs */}
                                    <div className="px-1">
                                      <p className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                                        <Globe className="h-3 w-3" />
                                        {domainsT("associatedIPs")}
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {domain.ips.map((ip) => {
                                          const gradient = getIPGradient(ip);
                                          return (
                                            <div
                                              key={ip}
                                              className="flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all"
                                            >
                                              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
                                                <Server className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                                              </div>
                                              <code className="text-xs font-mono break-all">{ip}</code>
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
                        });
                      })()}
                    </div>

                    {/* Pagination */}
                    {filteredDomains.length > 0 && (
                      <div className="p-3 border-t border-border/50 bg-secondary/20">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                                  <Rows3 className="h-4 w-4" />
                                  <span>{domainPageSize} / {domainsT("page")}</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                  <DropdownMenuItem
                                    key={size}
                                    onClick={() => {
                                      setDomainPageSize(size);
                                      setDomainPage(1);
                                    }}
                                    className={domainPageSize === size ? "bg-primary/10" : ""}
                                  >
                                    {size} / {domainsT("page")}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="text-sm text-muted-foreground">
                              {domainsT("total")} {filteredDomains.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              {(domainPage - 1) * domainPageSize + 1}-{Math.min(domainPage * domainPageSize, filteredDomains.length)} / {filteredDomains.length}
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setDomainPage(p => Math.max(1, p - 1))}
                                disabled={domainPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              {getPageNumbers(domainPage, domainTotalPages).map((page, idx) => (
                                page === '...' ? (
                                  <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-xs">...</span>
                                ) : (
                                  <Button
                                    key={page}
                                    variant={domainPage === page ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 w-8 px-0 text-xs"
                                    onClick={() => setDomainPage(page as number)}
                                  >
                                    {page}
                                  </Button>
                                )
                              ))}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setDomainPage(p => Math.min(domainTotalPages, p + 1))}
                                disabled={domainPage === domainTotalPages}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ips" className="mt-4">
            <Card>
              {/* Header with search */}
              <div className="p-4 border-b border-border/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">{ipsT("associatedIPs")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {filteredIPs.length} IPs
                    </p>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder={ipsT("search")}
                      value={ipSearch}
                      onChange={(e) => {
                        setIpSearch(e.target.value);
                        setIpPage(1);
                      }}
                      className="h-9 w-full sm:w-[240px] bg-secondary/50 border-0"
                    />
                  </div>
                </div>
              </div>

              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredIPs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {ipSearch ? ipsT("noResults") : "No IPs found"}
                  </div>
                ) : (
                  <>
                    {/* Desktop Table Header */}
                    <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-secondary/30 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <div 
                        className="col-span-3 flex items-center cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleIPSort("ip")}
                      >
                        {ipsT("ipAddress")}
                        <IPSortIcon column="ip" />
                      </div>
                      <div className="col-span-2 flex items-center">
                        {ipsT("location")}
                      </div>
                      <div 
                        className="col-span-2 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleIPSort("totalDownload")}
                      >
                        {ipsT("download")}
                        <IPSortIcon column="totalDownload" />
                      </div>
                      <div 
                        className="col-span-1 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleIPSort("totalUpload")}
                      >
                        {ipsT("upload")}
                        <IPSortIcon column="totalUpload" />
                      </div>
                      <div 
                        className="col-span-1 flex items-center justify-end cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleIPSort("totalConnections")}
                      >
                        {ipsT("conn")}
                        <IPSortIcon column="totalConnections" />
                      </div>
                      <div className="col-span-2 flex items-center justify-end">
                        {ipsT("domainCount")}
                      </div>
                    </div>

                    {/* Mobile Sort Bar */}
                    <div className="sm:hidden flex items-center gap-2 px-4 py-2 bg-secondary/30 overflow-x-auto scrollbar-hide">
                      {([
                        { key: "ip" as IPSortKey, label: ipsT("ipAddress") },
                        { key: "totalDownload" as IPSortKey, label: ipsT("download") },
                        { key: "totalUpload" as IPSortKey, label: ipsT("upload") },
                        { key: "totalConnections" as IPSortKey, label: ipsT("conn") },
                      ]).map(({ key, label }) => (
                        <button
                          key={key}
                          className={cn(
                            "flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                            ipSortKey === key
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          onClick={() => handleIPSort(key)}
                        >
                          {label}
                          {ipSortKey === key && (
                            ipSortOrder === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* IP List */}
                    <div className="divide-y divide-border/30">
                      {(() => {
                        const totalIPTraffic = filteredIPs.reduce(
                          (sum, ip) => sum + ip.totalDownload + ip.totalUpload, 0
                        );
                        return paginatedIPs.map((ip, index) => {
                          const ipTraffic = ip.totalDownload + ip.totalUpload;
                          const percent = totalIPTraffic > 0 ? (ipTraffic / totalIPTraffic) * 100 : 0;
                          const isExpanded = expandedIP === ip.ip;
                          const ipColor = getIPColor(ip.ip);
                          
                          return (
                            <div key={ip.ip} className="group">
                              {/* Desktop Row */}
                              <div
                                className={cn(
                                  "hidden sm:grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-secondary/20 transition-colors cursor-pointer",
                                  isExpanded && "bg-secondary/10"
                                )}
                                style={{ animationDelay: `${index * 50}ms` }}
                                onClick={() => toggleExpandIP(ip.ip)}
                              >
                                {/* IP with Icon */}
                                <div className="col-span-3 flex items-center gap-3 min-w-0">
                                  <div className={`w-5 h-5 rounded-md ${ipColor.bg} ${ipColor.text} flex items-center justify-center shrink-0`}>
                                    <Server className="w-3 h-3" />
                                  </div>
                                  <code className="text-sm font-mono truncate">{ip.ip}</code>
                                </div>

                                {/* Location */}
                                <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                                  {ip.geoIP && ip.geoIP.length > 0 ? (
                                    <>
                                      <span className="text-sm shrink-0" title={ip.geoIP[1] || ip.geoIP[0]}>
                                        {getCountryFlag(ip.geoIP[0])}
                                      </span>
                                      <span className="text-xs truncate">{ip.geoIP[1] || ip.geoIP[0]}</span>
                                    </>
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
                                      toggleExpandIP(ip.ip);
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
                                onClick={() => toggleExpandIP(ip.ip)}
                              >
                                {/* Top: IP Icon + IP + Location + Expand */}
                                <div className="flex items-center gap-2.5 mb-2">
                                  <div className={`w-5 h-5 rounded-md ${ipColor.bg} ${ipColor.text} flex items-center justify-center shrink-0`}>
                                    <Server className="w-3 h-3" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <code className="text-sm font-medium truncate block">{ip.ip}</code>
                                    {ip.geoIP && ip.geoIP.length > 0 && (
                                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <span className="text-sm">{getCountryFlag(ip.geoIP[0])}</span>
                                        <span className="truncate">{ip.geoIP[1] || ip.geoIP[0]}</span>
                                      </div>
                                    )}
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
                                      toggleExpandIP(ip.ip);
                                    }}
                                  >
                                    <Link2 className="h-3 w-3" />
                                    {ip.domains.length}
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </Button>
                                </div>

                                {/* Bottom: Stats row */}
                                <div className="flex items-center justify-between text-xs pl-[30px]">
                                  <span className="text-blue-500 tabular-nums">↓ {formatBytes(ip.totalDownload)}</span>
                                  <span className="text-purple-500 tabular-nums">↑ {formatBytes(ip.totalUpload)}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
                                    {formatNumber(ip.totalConnections)} {ipsT("conn")}
                                  </span>
                                </div>
                              </div>

                              {/* Expanded Details: Associated Domains */}
                              {isExpanded && (
                                <div className="px-4 sm:px-5 pb-4 bg-secondary/5">
                                  <div className="pt-3">
                                    {/* Associated Domains */}
                                    <div className="px-1">
                                      <p className="text-xs font-medium text-muted-foreground mb-2.5 flex items-center gap-1.5">
                                        <Link2 className="h-3 w-3" />
                                        {ipsT("associatedDomains")}
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
                        });
                      })()}
                    </div>

                    {/* Pagination */}
                    {filteredIPs.length > 0 && (
                      <div className="p-3 border-t border-border/50 bg-secondary/20">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground hover:text-foreground">
                                  <Rows3 className="h-4 w-4" />
                                  <span>{ipPageSize} / {ipsT("page")}</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                  <DropdownMenuItem
                                    key={size}
                                    onClick={() => {
                                      setIpPageSize(size);
                                      setIpPage(1);
                                    }}
                                    className={ipPageSize === size ? "bg-primary/10" : ""}
                                  >
                                    {size} / {ipsT("page")}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <span className="text-sm text-muted-foreground">
                              {ipsT("total")} {filteredIPs.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              {(ipPage - 1) * ipPageSize + 1}-{Math.min(ipPage * ipPageSize, filteredIPs.length)} / {filteredIPs.length}
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setIpPage(p => Math.max(1, p - 1))}
                                disabled={ipPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              {getPageNumbers(ipPage, ipTotalPages).map((page, idx) => (
                                page === '...' ? (
                                  <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground text-xs">...</span>
                                ) : (
                                  <Button
                                    key={page}
                                    variant={ipPage === page ? "default" : "ghost"}
                                    size="sm"
                                    className="h-8 w-8 px-0 text-xs"
                                    onClick={() => setIpPage(page as number)}
                                  >
                                    {page}
                                  </Button>
                                )
                              ))}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setIpPage(p => Math.min(ipTotalPages, p + 1))}
                                disabled={ipPage === ipTotalPages}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
