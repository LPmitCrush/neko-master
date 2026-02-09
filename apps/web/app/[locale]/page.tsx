"use client";

import { useEffect, useState, useCallback, memo, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useTheme } from "next-themes";
import { keepPreviousData, useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Globe,
  MapPin,
  Server,
  Route,
  Activity,
  RefreshCw,
  Radio,
  ChevronDown,
  Settings,
  AlertTriangle,
  Moon,
  Sun,
  Monitor,
  Info,
  MoreVertical,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { Navigation } from "@/components/navigation";
import { StatsCards } from "@/components/stats-cards";
import { OverviewTab } from "@/components/overview";
import { TopDomainsChart } from "@/components/top-domains-chart";
import { ProxyStatsChart } from "@/components/proxy-stats-chart";
import { InteractiveProxyStats } from "@/components/interactive-proxy-stats";
import { InteractiveDeviceStats } from "@/components/interactive-device-stats";
import { InteractiveRuleStats } from "@/components/interactive-rule-stats";
import { RuleChainChart } from "@/components/rule-chain-chart";
import { WorldTrafficMap } from "@/components/world-traffic-map";
import { CountryTrafficList } from "@/components/country-traffic-list";
import { DomainsTable } from "@/components/domains-table";
import { IPsTable } from "@/components/ips-table";
import { BackendConfigDialog } from "@/components/backend-config-dialog";
import { AboutDialog } from "@/components/about-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TimeRangePicker } from "@/components/time-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  api,
  getPresetTimeRange,
  type TimeRange,
} from "@/lib/api";
import {
  getCountriesQueryKey,
  getDevicesQueryKey,
  getSummaryQueryKey,
} from "@/lib/stats-query-keys";
import { cn } from "@/lib/utils";
import type { StatsSummary, CountryStats, DeviceStats } from "@clashmaster/shared";

function formatTimeAgo(date: Date, t: any): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) return t("justNow");
  if (seconds < 60) return t("secondsAgo", { seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("minutesAgo", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { hours });
  return t("daysAgo", { days: Math.floor(hours / 24) });
}

const NAV_ITEMS = [
  { id: "overview", label: "overview" },
  { id: "domains", label: "domains" },
  { id: "countries", label: "countries" },
  { id: "devices", label: "devices" },
  { id: "proxies", label: "proxies" },
  { id: "rules", label: "rules" },
];

type TimePreset = "1m" | "5m" | "15m" | "30m" | "24h" | "7d" | "30d" | "today" | "custom";
type RollingTimePreset = Exclude<TimePreset, "custom">;
type BackendStatus = "healthy" | "unhealthy" | "unknown";

function isRollingTimePreset(preset: TimePreset): preset is RollingTimePreset {
  return preset !== "custom";
}

// Memoized tab content components to prevent unnecessary re-renders
const OverviewContent = memo(function OverviewContent({
  data,
  countryData,
  error,
  timeRange,
  timePreset,
  activeBackendId,
  onNavigate,
  backendStatus,
}: {
  data: StatsSummary | null;
  countryData: CountryStats[];
  error: string | null;
  timeRange: TimeRange;
  timePreset: TimePreset;
  activeBackendId?: number;
  onNavigate?: (tab: string) => void;
  backendStatus: BackendStatus;
}) {
  return (
    <div className="space-y-6">
      <StatsCards data={data} error={error} backendStatus={backendStatus} />
      <OverviewTab
        domains={data?.topDomains || []}
        proxies={data?.proxyStats || []}
        countries={countryData}
        timeRange={timeRange}
        timePreset={timePreset}
        activeBackendId={activeBackendId}
        onNavigate={onNavigate}
        backendStatus={backendStatus}
      />
    </div>
  );
});

const DomainsContent = memo(function DomainsContent({
  data,
  activeBackendId,
  timeRange,
}: {
  data: StatsSummary | null;
  activeBackendId?: number;
  timeRange: TimeRange;
}) {
  const t = useTranslations("domains");
  return (
    <div className="space-y-6">
      <TopDomainsChart activeBackendId={activeBackendId} timeRange={timeRange} />
      <Tabs defaultValue="domains" className="w-full">
        <TabsList className="glass">
          <TabsTrigger value="domains">{t("domainList")}</TabsTrigger>
          <TabsTrigger value="ips">{t("ipList")}</TabsTrigger>
        </TabsList>
        <TabsContent value="domains" className="overflow-hidden">
          <DomainsTable activeBackendId={activeBackendId} timeRange={timeRange} />
        </TabsContent>
        <TabsContent value="ips" className="overflow-hidden">
          <IPsTable activeBackendId={activeBackendId} timeRange={timeRange} />
        </TabsContent>
      </Tabs>
    </div>
  );
});

const CountriesContent = memo(function CountriesContent({
  countryData,
}: {
  countryData: CountryStats[];
}) {
  const t = useTranslations("countries");
  return (
    <div className="space-y-6">
      <WorldTrafficMap data={countryData} />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t("details")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CountryTrafficList data={countryData} />
        </CardContent>
      </Card>
    </div>
  );
});

const ProxiesContent = memo(function ProxiesContent({
  activeBackendId,
  timeRange,
  backendStatus,
}: {
  activeBackendId?: number;
  timeRange: TimeRange;
  backendStatus: BackendStatus;
}) {
  return (
    <div className="space-y-6">
      <InteractiveProxyStats
        activeBackendId={activeBackendId}
        timeRange={timeRange}
        backendStatus={backendStatus}
      />
    </div>
  );
});

const RulesContent = memo(function RulesContent({
  activeBackendId,
  timeRange,
  backendStatus,
}: {
  activeBackendId?: number;
  timeRange: TimeRange;
  backendStatus: BackendStatus;
}) {
  return (
    <div className="space-y-6">
      <InteractiveRuleStats
        activeBackendId={activeBackendId}
        timeRange={timeRange}
        backendStatus={backendStatus}
      />
    </div>
  );
});

const DevicesContent = memo(function DevicesContent({
  activeBackendId,
  timeRange,
  backendStatus,
}: {
  activeBackendId?: number;
  timeRange: TimeRange;
  backendStatus: BackendStatus;
}) {
  const stableTimeRange = useMemo<TimeRange | undefined>(() => {
    if (!timeRange?.start && !timeRange?.end) return undefined;
    return { start: timeRange.start, end: timeRange.end };
  }, [timeRange?.start, timeRange?.end]);

  const devicesQuery = useQuery({
    queryKey: getDevicesQueryKey(activeBackendId, 50, stableTimeRange),
    queryFn: () => api.getDevices(activeBackendId, 50, stableTimeRange),
    enabled: !!activeBackendId,
    placeholderData: keepPreviousData,
  });

  const deviceStats: DeviceStats[] = devicesQuery.data ?? [];
  const loading = devicesQuery.isLoading && !devicesQuery.data;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InteractiveDeviceStats
        data={deviceStats}
        activeBackendId={activeBackendId}
        timeRange={timeRange}
        backendStatus={backendStatus}
      />
    </div>
  );
});

const NetworkContent = memo(function NetworkContent() {
  const t = useTranslations("network");
  return (
    <div className="space-y-6">
      <div className="p-12 text-center text-muted-foreground border rounded-xl">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>{t("comingSoon")}</p>
      </div>
    </div>
  );
});

export default function DashboardPage() {
  const t = useTranslations("nav");
  const dashboardT = useTranslations("dashboard");
  const backendT = useTranslations("backend");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [timeRange, setTimeRange] = useState<TimeRange>(getPresetTimeRange("24h"));
  const [timePreset, setTimePreset] = useState<TimePreset>("24h");
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showBackendDialog, setShowBackendDialog] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  const stableTimeRange = useMemo<TimeRange | undefined>(() => {
    if (!timeRange?.start && !timeRange?.end) return undefined;
    return { start: timeRange.start, end: timeRange.end };
  }, [timeRange?.start, timeRange?.end]);

  const backendsQuery = useQuery({
    queryKey: ["backends"],
    queryFn: () => api.getBackends(),
  });

  const backends = backendsQuery.data ?? [];
  const activeBackend = useMemo(
    () => backends.find((backend) => backend.is_active) || backends[0] || null,
    [backends],
  );
  const listeningBackends = useMemo(
    () => backends.filter((backend) => backend.listening),
    [backends],
  );
  const activeBackendId = activeBackend?.id;

  const needsSummary = activeTab === "overview";
  const needsCountries = activeTab === "overview" || activeTab === "countries";

  const summaryQuery = useQuery({
    queryKey: getSummaryQueryKey(activeBackendId, stableTimeRange),
    queryFn: () => api.getSummary(activeBackendId, stableTimeRange),
    enabled: !!activeBackendId && needsSummary,
    placeholderData: keepPreviousData,
  });

  const countriesQuery = useQuery({
    queryKey: getCountriesQueryKey(activeBackendId, 50, stableTimeRange),
    queryFn: () => api.getCountries(activeBackendId, 50, stableTimeRange),
    enabled: !!activeBackendId && needsCountries,
    placeholderData: keepPreviousData,
  });

  const data: StatsSummary | null = summaryQuery.data ?? null;
  const countryData: CountryStats[] = countriesQuery.data ?? [];
  const statsFetchingCount = useIsFetching({ queryKey: ["stats"] });
  const isLoading = isManualRefreshing || statsFetchingCount > 0;

  const queryError = useMemo(() => {
    if (needsSummary && summaryQuery.error) {
      return summaryQuery.error instanceof Error
        ? summaryQuery.error.message
        : "Unknown error";
    }
    if (needsCountries && countriesQuery.error) {
      return countriesQuery.error instanceof Error
        ? countriesQuery.error.message
        : "Unknown error";
    }
    return null;
  }, [needsSummary, summaryQuery.error, needsCountries, countriesQuery.error]);

  const backendStatus: BackendStatus = useMemo(() => {
    if (!activeBackend) return "unknown";
    if (queryError) return "unhealthy";
    if (activeBackend.listening) return "healthy";
    return "unhealthy";
  }, [activeBackend, queryError]);

  const backendStatusHint = useMemo(() => {
    if (queryError) return queryError;
    if (activeBackend && !activeBackend.listening) return dashboardT("backendUnavailableHint");
    return null;
  }, [queryError, activeBackend, dashboardT]);

  const refreshNow = useCallback(
    async (showLoading = false) => {
      if (showLoading) {
        setIsManualRefreshing(true);
      }
      try {
        if (isRollingTimePreset(timePreset)) {
          setTimeRange(getPresetTimeRange(timePreset));
        }
        await queryClient.invalidateQueries({ queryKey: ["stats"] });
      } finally {
        if (showLoading) {
          setIsManualRefreshing(false);
        }
      }
    },
    [queryClient, timePreset],
  );

  const handleTimeRangeChange = useCallback(
    (range: TimeRange, preset: TimePreset) => {
      setTimePreset(preset);
      setTimeRange(range);
    },
    [],
  );

  // Switch active backend
  const handleSwitchBackend = async (backendId: number) => {
    try {
      await api.setActiveBackend(backendId);
      await backendsQuery.refetch();
      await refreshNow(true);
    } catch (err) {
      console.error("Failed to switch backend:", err);
    }
  };

  // Handle backend configuration changes
  const handleBackendChange = useCallback(async () => {
    await backendsQuery.refetch();
    await refreshNow(true);
  }, [backendsQuery.refetch, refreshNow]);

  // Open setup dialog automatically when no backend is configured.
  useEffect(() => {
    if (backendsQuery.isError) return;
    if (backendsQuery.isLoading || backendsQuery.isFetching) return;
    if (backends.length === 0) {
      setIsFirstTime(true);
      setShowBackendDialog(true);
      return;
    }
    if (isFirstTime) {
      setIsFirstTime(false);
    }
  }, [backends.length, backendsQuery.isError, backendsQuery.isFetching, backendsQuery.isLoading, isFirstTime]);

  // Keep rolling windows fresh by moving the range every 5s.
  useEffect(() => {
    if (!autoRefresh || !isRollingTimePreset(timePreset)) return;
    const interval = setInterval(() => {
      setTimeRange(getPresetTimeRange(timePreset));
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, timePreset]);

  // For fixed windows, keep polling active stats queries.
  useEffect(() => {
    if (!autoRefresh || isRollingTimePreset(timePreset)) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, timePreset, queryClient]);

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewContent
            data={data}
            countryData={countryData}
            error={queryError}
            timeRange={timeRange}
            timePreset={timePreset}
            activeBackendId={activeBackendId}
            onNavigate={setActiveTab}
            backendStatus={backendStatus}
          />
        );
      case "domains":
        return <DomainsContent data={data} activeBackendId={activeBackendId} timeRange={timeRange} />;
      case "countries":
        return <CountriesContent countryData={countryData} />;
      case "proxies":
        return (
          <ProxiesContent
            activeBackendId={activeBackendId}
            timeRange={timeRange}
            backendStatus={backendStatus}
          />
        );
      case "rules":
        return (
          <RulesContent
            activeBackendId={activeBackendId}
            timeRange={timeRange}
            backendStatus={backendStatus}
          />
        );
      case "devices":
        return (
          <DevicesContent
            activeBackendId={activeBackendId}
            timeRange={timeRange}
            backendStatus={backendStatus}
          />
        );
      case "network":
        return <NetworkContent />;
      default:
        return (
          <OverviewContent
            data={data}
            countryData={countryData}
            error={queryError}
            timeRange={timeRange}
            timePreset={timePreset}
            activeBackendId={activeBackendId}
            onNavigate={setActiveTab}
            backendStatus={backendStatus}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBackendChange={handleBackendChange}
        backendStatus={backendStatus}
      />

      <main className="flex-1 min-w-0 lg:ml-0">
        <header className="sticky top-0 z-40 lg:static border-b border-border/40 bg-background/80 backdrop-blur-md">
          <div className="flex items-center justify-between h-14 px-4 lg:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile: Logo, Desktop: Page Title */}
              <div className="flex items-center gap-2">
                <div className="lg:hidden w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
                  <Image
                    src="/clash-master.png"
                    alt="Clash Master"
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                  />
                </div>
                <h2 className="hidden lg:block font-semibold">
                  {t(activeTab)}
                </h2>
              </div>

              {/* Backend Selector */}
              {backends.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 px-2 sm:px-3">
                      <Server className="w-4 h-4" />
                      <span className="max-w-[80px] sm:max-w-[120px] truncate">
                        {activeBackend?.name || backendT("selectBackend")}
                      </span>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>
                      {backendT("backendsTab")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {backends.map((backend) => (
                      <DropdownMenuItem
                        key={backend.id}
                        onClick={() => handleSwitchBackend(backend.id)}
                        className="flex items-center justify-between">
                        <span
                          className={cn(
                            "truncate",
                            backend.is_active && "font-medium",
                          )}>
                          {backend.name}
                        </span>
                        <div className="flex items-center gap-1">
                          {!!backend.is_active && (
                            <Badge
                              variant="default"
                              className="text-[10px] h-5">
                              {backendT("displaying")}
                            </Badge>
                          )}
                          {!!backend.listening && !backend.is_active && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-5 gap-1">
                              <Radio className="w-2 h-2" />
                              {backendT("collecting")}
                            </Badge>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowBackendDialog(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      {backendT("manageBackends")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Listening Indicators */}
              {listeningBackends.length > 0 && (
                <div className="hidden md:flex items-center gap-1">
                  {listeningBackends.slice(0, 3).map((backend) => (
                    <Badge
                      key={backend.id}
                      variant="outline"
                      className="text-[10px] h-5 gap-1 px-1.5 border-green-500/30 text-green-600">
                      <Radio className="w-2 h-2" />
                      {backend.name}
                    </Badge>
                  ))}
                  {listeningBackends.length > 3 && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                      +{listeningBackends.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-2">
              {/* Desktop: Compact auto-refresh toggle */}
              <div className="hidden sm:flex items-center mr-1">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setAutoRefresh((prev) => !prev)}
                        aria-label={autoRefresh ? dashboardT("autoRefresh") : dashboardT("paused")}
                        className={cn(
                          "h-9 w-9 rounded-full transition-colors",
                          autoRefresh
                            ? "text-emerald-600 hover:bg-emerald-500/10"
                            : "text-muted-foreground hover:bg-muted",
                        )}>
                        <RefreshCw className={cn("w-4 h-4", autoRefresh && "text-emerald-500")} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-medium">
                        {autoRefresh ? dashboardT("autoRefresh") : dashboardT("paused")}
                      </p>
                      <p className="opacity-80">
                        {autoRefresh ? dashboardT("clickToPause") : dashboardT("clickToResume")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Desktop: Language & Theme */}
              <div className="hidden sm:flex items-center gap-1">
                <TimeRangePicker
                  value={timeRange}
                  onChange={handleTimeRangeChange}
                />
                <LanguageSwitcher />
                <ThemeToggle />
              </div>

              {/* Mobile: Time range picker */}
              <div className="sm:hidden">
                <TimeRangePicker
                  value={timeRange}
                  onChange={handleTimeRangeChange}
                  className="w-[122px]"
                />
              </div>

              {/* Mobile: Backend warning in top actions */}
              {backendStatus === "unhealthy" && (
                <div className="sm:hidden">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={dashboardT("backendUnavailable")}
                        className="relative h-9 w-9 text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping [animation-duration:900ms]" />
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      side="bottom"
                      className="w-[240px] p-3"
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">
                            {dashboardT("backendUnavailable")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {backendStatusHint || dashboardT("backendUnavailableHint")}
                          </p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Mobile: More Options Dropdown */}
              <div className="sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {/* Auto Refresh Toggle -->
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      {dashboardT("refresh")}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        setAutoRefresh((prev) => !prev);
                      }}>
                      <div className="flex items-center justify-between w-full">
                        <span>{autoRefresh ? dashboardT("autoRefresh") : dashboardT("paused")}</span>
                        <Switch
                          checked={autoRefresh}
                          onCheckedChange={setAutoRefresh}
                          onClick={(event) => event.stopPropagation()}
                          className="data-[state=checked]:bg-emerald-500 ml-2"
                        />
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    
                    {/* Theme Selection */}
                    <DropdownMenuLabel className="flex items-center gap-2">
                      {theme === "dark" ? (
                        <Moon className="w-4 h-4" />
                      ) : (
                        <Sun className="w-4 h-4" />
                      )}
                      Theme
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setTheme("light")}
                      className={theme === "light" ? "bg-muted" : ""}>
                      <Sun className="w-4 h-4 mr-2 text-amber-500" />
                      Light {theme === "light" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setTheme("dark")}
                      className={theme === "dark" ? "bg-muted" : ""}>
                      <Moon className="w-4 h-4 mr-2 text-indigo-500" />
                      Dark {theme === "dark" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setTheme("system")}
                      className={theme === "system" ? "bg-muted" : ""}>
                      <Monitor className="w-4 h-4 mr-2 text-slate-500" />
                      System {theme === "system" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Language Selection */}
                    <DropdownMenuLabel className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Language
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        const newPathname = pathname.replace(
                          `/${locale}`,
                          "/en",
                        );
                        router.push(newPathname);
                      }}
                      className={locale === "en" ? "bg-muted" : ""}>
                      English {locale === "en" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        const newPathname = pathname.replace(
                          `/${locale}`,
                          "/zh",
                        );
                        router.push(newPathname);
                      }}
                      className={locale === "zh" ? "bg-muted" : ""}>
                      中文 {locale === "zh" && "✓"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />

                    {/* Settings */}
                    <DropdownMenuItem
                      onClick={() => setShowBackendDialog(true)}>
                      <Settings className="w-4 h-4 mr-2" />
                      {backendT("manageBackends")}
                    </DropdownMenuItem>

                    {/* About */}
                    <DropdownMenuItem onClick={() => setShowAboutDialog(true)}>
                      <Info className="w-4 h-4 mr-2 text-primary" />
                      About
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Refresh Button - Both Desktop & Mobile */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => refreshNow(true)}
                disabled={isLoading}
                className="h-9 w-9">
                <RefreshCw
                  className={cn("w-4 h-4", isLoading && "animate-spin")}
                />
              </Button>
            </div>
          </div>
        </header>

        <div className="p-4 lg:p-6 pb-24 lg:pb-6 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>

      {/* Backend Configuration Dialog */}
      <BackendConfigDialog
        open={showBackendDialog}
        onOpenChange={setShowBackendDialog}
        isFirstTime={isFirstTime}
        onConfigComplete={() => {
          setIsFirstTime(false);
          handleBackendChange();
        }}
        onBackendChange={handleBackendChange}
      />

      {/* About Dialog */}
      <AboutDialog open={showAboutDialog} onOpenChange={setShowAboutDialog} />
    </div>
  );
}
