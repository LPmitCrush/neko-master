"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { 
  Server, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Database,
  HardDrive,
  Trash,
  Settings,
  Radio,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, formatBytes, formatNumber } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { BackendVerifyAnimation } from "./backend-verify-animation";

interface Backend {
  id: number;
  name: string;
  url: string;
  host: string;
  port: number;
  token: string;
  enabled: boolean;
  is_active: boolean;
  listening: boolean;
  hasToken?: boolean;
  created_at: string;
}

interface BackendConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isFirstTime?: boolean;
  onConfigComplete?: () => void;
  onBackendChange?: () => void;
}

interface DbStats {
  size: number;
  totalConnectionsCount: number;
}

// Parse URL to host and port
function parseUrl(url: string): { host: string; port: string; ssl: boolean } {
  try {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'),
      ssl: urlObj.protocol === 'https:',
    };
  } catch {
    return { host: '', port: '9090', ssl: false };
  }
}

// Build URL from host, port, ssl
function buildUrl(host: string, port: string, ssl: boolean): string {
  const protocol = ssl ? 'https' : 'http';
  return `${protocol}://${host}:${port}`;
}

export function BackendConfigDialog({
  open,
  onOpenChange,
  isFirstTime = false,
  onConfigComplete,
  onBackendChange,
}: BackendConfigDialogProps) {
  const t = useTranslations("backend");
  const commonT = useTranslations("common");
  
  const [backends, setBackends] = useState<Backend[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'backends' | 'database'>('backends');
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [clearingLogs, setClearingLogs] = useState(false);
  
  // Alert Dialog States
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBackendId, setDeleteBackendId] = useState<number | null>(null);
  const [clearLogsDialogOpen, setClearLogsDialogOpen] = useState(false);
  const [clearLogsDays, setClearLogsDays] = useState<number>(0);
  const [clearBackendDataDialogOpen, setClearBackendDataDialogOpen] = useState(false);
  const [clearDataBackendId, setClearDataBackendId] = useState<number | null>(null);
  
  // Error Alert Dialog State
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Success Alert Dialog State
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Verify Animation State
  const [showVerifyAnimation, setShowVerifyAnimation] = useState(false);
  const [verifyPhase, setVerifyPhase] = useState<"pending" | "success" | "error">("pending");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [pendingBackend, setPendingBackend] = useState<{ name: string; url: string; token: string } | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    host: "",
    port: "9090",
    ssl: false,
    token: "",
  });

  useEffect(() => {
    if (open) {
      loadBackends();
      loadDbStats();
    }
  }, [open]);

  const loadBackends = async () => {
    try {
      const data = await api.getBackends();
      // Parse URL to host/port for display
      const parsedData: Backend[] = data.map((b) => {
        const parsed = parseUrl(b.url);
        return { ...b, host: parsed.host, port: parseInt(parsed.port) || 9090 };
      });
      setBackends(parsedData);
    } catch (error) {
      console.error("Failed to load backends:", error);
    }
  };

  const loadDbStats = async () => {
    try {
      const stats = await api.getDbStats();
      setDbStats(stats);
    } catch (error) {
      console.error("Failed to load DB stats:", error);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.host) return;
    
    const url = buildUrl(formData.host, formData.port, formData.ssl);
    
    // Show verification animation immediately
    setPendingBackend({ name: formData.name, url, token: formData.token });
    setVerifyPhase("pending");
    setVerifyMessage("");
    setShowVerifyAnimation(true);
    
    // Perform verification
    try {
      const testResult = await api.testBackend(url, formData.token);
      
      if (testResult.success) {
        setVerifyPhase("success");
        setVerifyMessage(testResult.message || t("testSuccess"));
      } else {
        setVerifyPhase("error");
        setVerifyMessage(testResult.message || t("testFailed"));
      }
    } catch (error: any) {
      setVerifyPhase("error");
      setVerifyMessage(error.message || t("testFailed"));
    }
  };

  // Called after verification animation completes
  const handleVerifyComplete = async () => {
    if (!pendingBackend) return;
    
    // Only save if verification was successful
    if (verifyPhase === "success") {
      try {
        const result = await api.createBackend({ 
          name: pendingBackend.name, 
          url: pendingBackend.url, 
          token: pendingBackend.token 
        });
        
        setFormData({ name: "", host: "", port: "9090", ssl: false, token: "" });
        setShowVerifyAnimation(false);
        setPendingBackend(null);
        await loadBackends();
        await onBackendChange?.();
        
        // Show success message for first backend
        if (result.isActive) {
          setTestResult({ success: true, message: t("firstBackendAutoActive") });
          setTimeout(() => setTestResult(null), 3000);
        }
        
        if (isFirstTime && onConfigComplete) {
          await onConfigComplete();
          onOpenChange(false);
        }
      } catch (error: any) {
        setShowVerifyAnimation(false);
        setPendingBackend(null);
        setErrorMessage(error.message || "Failed to create backend");
        setErrorDialogOpen(true);
      }
    } else {
      // Verification failed, just close animation and reset
      setShowVerifyAnimation(false);
      setPendingBackend(null);
    }
  };

  const handleUpdate = async (id: number) => {
    setLoading(true);
    try {
      const url = buildUrl(formData.host, formData.port, formData.ssl);
      await api.updateBackend(id, { 
        name: formData.name, 
        url, 
        token: formData.token || undefined 
      });
      setEditingId(null);
      setFormData({ name: "", host: "", port: "9090", ssl: false, token: "" });
      await loadBackends();
      await onBackendChange?.();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to update backend");
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (id: number) => {
    setDeleteBackendId(id);
    setDeleteDialogOpen(true);
  };

  // Handle actual delete
  const handleDelete = async () => {
    if (!deleteBackendId) return;
    
    setLoading(true);
    try {
      await api.deleteBackend(deleteBackendId);
      await loadBackends();
      await onBackendChange?.();
      setDeleteDialogOpen(false);
      setDeleteBackendId(null);
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to delete backend");
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  // Handle set active backend (for display)
  const handleSetActive = async (id: number) => {
    try {
      await api.setActiveBackend(id);
      // Refresh local backend list to update UI (active state, eye icon)
      await loadBackends();
      // Notify parent to refresh dashboard data
      await onBackendChange?.();
      // Show toast notification
      toast.success(t("switchSuccess"));
    } catch (error: any) {
      toast.error(error.message || t("switchFailed"));
    }
  };

  // Handle toggle listening (data collection)
  const handleToggleListening = async (id: number, listening: boolean) => {
    try {
      await api.setBackendListening(id, listening);
      await loadBackends();
      await onBackendChange?.();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to update listening state");
      setErrorDialogOpen(true);
    }
  };

  // Open clear backend data dialog
  const openClearBackendDataDialog = (id: number) => {
    setClearDataBackendId(id);
    setClearBackendDataDialogOpen(true);
  };

  // Handle clear backend data
  const handleClearBackendData = async () => {
    if (!clearDataBackendId) return;
    
    setLoading(true);
    try {
      await api.clearBackendData(clearDataBackendId);
      await loadDbStats();
      await onBackendChange?.();
      setClearBackendDataDialogOpen(false);
      setClearDataBackendId(null);
    } catch (error: any) {
      setErrorMessage(error.message || t("clearBackendDataError") || "Failed to clear backend data");
      setErrorDialogOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (backend: Backend) => {
    setTestingId(backend.id);
    setTestResult(null);
    try {
      const result = await api.testBackend(backend.url, backend.token);
      setTestResult(result);
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || "Test failed" });
    } finally {
      setTestingId(null);
    }
  };

  // Open clear logs dialog
  const openClearLogsDialog = (days: number) => {
    setClearLogsDays(days);
    setClearLogsDialogOpen(true);
  };

  // Handle actual clear logs
  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      await api.clearLogs(clearLogsDays);
      await loadDbStats();
      setClearLogsDialogOpen(false);
      setSuccessMessage(t("logsCleared"));
      setSuccessDialogOpen(true);
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to clear logs");
      setErrorDialogOpen(true);
    } finally {
      setClearingLogs(false);
    }
  };

  const startEdit = (backend: Backend) => {
    setEditingId(backend.id);
    setFormData({
      name: backend.name,
      host: backend.host,
      port: String(backend.port || 9090),
      ssl: backend.url.startsWith('https'),
      token: "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormData({ name: "", host: "", port: "9090", ssl: false, token: "" });
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {isFirstTime ? t("firstTimeTitle") : t("title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isFirstTime ? t("firstTimeDescription") : t("description")}
            </p>
            
            {/* Tabs */}
            <div className="flex gap-2 mt-4">
              <Button
                variant={activeTab === 'backends' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('backends')}
              >
                <Server className="w-4 h-4 mr-2" />
                {t("backendsTab")}
              </Button>
              <Button
                variant={activeTab === 'database' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveTab('database')}
              >
                <Database className="w-4 h-4 mr-2" />
                {t("databaseTab")}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {activeTab === 'backends' ? (
              // Backends Tab
              <div className="space-y-3">
                {backends.map((backend) => (
                  <div
                    key={backend.id}
                    className={cn(
                      "p-4 rounded-lg border transition-all",
                      backend.is_active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                      !backend.enabled && "opacity-60"
                    )}
                  >
                    {editingId === backend.id ? (
                      // Edit Mode
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium">{t("name")}</label>
                            <Input
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              placeholder={t("namePlaceholder")}
                              className="h-9 mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium">{t("host")}</label>
                            <Input
                              value={formData.host}
                              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                              placeholder="192.168.1.1"
                              className="h-9 mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium">{t("port")}</label>
                            <Input
                              value={formData.port}
                              onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                              placeholder="9090"
                              className="h-9 mt-1"
                            />
                          </div>
                          <div className="col-span-2 flex items-center gap-2 pt-5">
                            <Switch
                              checked={formData.ssl}
                              onCheckedChange={(checked) => setFormData({ ...formData, ssl: checked })}
                            />
                            <label className="text-sm">{t("useSsl")}</label>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium">{t("token")}</label>
                          <Input
                            type="password"
                            value={formData.token}
                            onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                            placeholder={t("tokenPlaceholder")}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={cancelEdit}>
                            <X className="w-4 h-4 mr-1" />
                            {commonT("cancel")}
                          </Button>
                          <Button size="sm" onClick={() => handleUpdate(backend.id)} disabled={loading}>
                            <Check className="w-4 h-4 mr-1" />
                            {commonT("save")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex items-center justify-between gap-4">
                        {/* Left: Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-base">{backend.name}</span>
                            {!backend.enabled && (
                              <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                                {t("disabled")}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {backend.host}:{backend.port}
                          </div>
                        </div>
                        
                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Collect Toggle with Label */}
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50">
                            <Switch
                              checked={backend.listening}
                              onCheckedChange={(checked) => handleToggleListening(backend.id, checked)}
                              className="data-[state=checked]:bg-green-500"
                            />
                            <span className="text-xs text-muted-foreground hidden sm:inline">
                              {t("collect")}
                            </span>
                          </div>

                          {/* Action Buttons Group */}
                          <div className="flex items-center gap-1 pl-2 border-l border-border">
                            {/* Set Active Button - Show placeholder when active to maintain layout */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "h-8 w-8",
                                backend.is_active && "opacity-50 cursor-not-allowed"
                              )}
                              onClick={() => !backend.is_active && handleSetActive(backend.id)}
                              disabled={backend.is_active}
                              title={backend.is_active ? t("displaying") : t("setActive")}
                            >
                              <Eye className={cn("w-4 h-4", backend.is_active && "text-primary")} />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleTest(backend)}
                              disabled={testingId === backend.id}
                              title={t("testConnection")}
                            >
                              <RefreshCw className={cn("w-4 h-4", testingId === backend.id && "animate-spin")} />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(backend)}
                              title={commonT("edit")}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => openDeleteDialog(backend.id)}
                              title={commonT("delete")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Test Result */}
                {testResult && (
                  <div
                    className={cn(
                      "p-3 rounded-lg flex items-center gap-2 text-sm",
                      testResult.success
                        ? "bg-green-500/10 text-green-600 border border-green-500/20"
                        : "bg-destructive/10 text-destructive border border-destructive/20"
                    )}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    {testResult.message}
                  </div>
                )}

                {/* Add New Backend Form */}
                <div className="p-4 rounded-lg border border-dashed border-border bg-muted/50">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    {backends.length === 0 && isFirstTime ? t("firstTimeTitle") : t("addNew")}
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium">{t("name")} *</label>
                        <Input
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder={t("namePlaceholder")}
                          className="h-9 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">{t("host")} *</label>
                        <Input
                          value={formData.host}
                          onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                          placeholder="192.168.1.1"
                          className="h-9 mt-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium">{t("port")}</label>
                        <Input
                          value={formData.port}
                          onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                          placeholder="9090"
                          className="h-9 mt-1"
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-2 pt-5">
                        <Switch
                          checked={formData.ssl}
                          onCheckedChange={(checked) => setFormData({ ...formData, ssl: checked })}
                        />
                        <label className="text-sm">{t("useSsl")}</label>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">{t("token")}</label>
                      <Input
                        type="password"
                        value={formData.token}
                        onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                        placeholder={t("tokenPlaceholder")}
                        className="h-9 mt-1"
                      />
                    </div>
                    <Button 
                      onClick={handleAdd} 
                      disabled={loading || !formData.name || !formData.host}
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {isFirstTime && backends.length === 0 ? t("saveAndContinue") : t("addBackend")}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              // Database Tab
              <div className="space-y-6">
                {/* DB Stats */}
                <div className="p-4 rounded-lg border bg-card">
                  <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    {t("databaseStats")}
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted">
                      <div className="text-xs text-muted-foreground">{t("dbSize")}</div>
                      <div className="text-lg font-semibold">
                        {dbStats ? formatBytes(dbStats.size) : "--"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-muted">
                      <div className="text-xs text-muted-foreground">{t("connectionsCount")}</div>
                      <div className="text-lg font-semibold">
                        {dbStats ? formatNumber(dbStats.totalConnectionsCount) : "--"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clear Logs */}
                <div className="p-4 rounded-lg border bg-card">
                  <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <Trash className="w-4 h-4" />
                    {t("clearLogs")}
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("clearLogsDescription")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openClearLogsDialog(1)}
                      disabled={clearingLogs}
                    >
                      {t("clear1Day")}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openClearLogsDialog(7)}
                      disabled={clearingLogs}
                    >
                      {t("clear7Days")}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openClearLogsDialog(30)}
                      disabled={clearingLogs}
                    >
                      {t("clear30Days")}
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => openClearLogsDialog(0)}
                      disabled={clearingLogs}
                    >
                      {t("clearAll")}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Close button for non-first-time */}
            {!isFirstTime && (
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {commonT("close")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteBackendId(null)}>
              {commonT("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {commonT("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Logs Confirmation Dialog */}
      <AlertDialog open={clearLogsDialogOpen} onOpenChange={setClearLogsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearLogs")}</AlertDialogTitle>
            <AlertDialogDescription>
              {clearLogsDays === 0 
                ? t("confirmClearAllLogs") 
                : t("confirmClearLogs", { days: clearLogsDays })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {commonT("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearLogs}
              className={clearLogsDays === 0 ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {commonT("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Error Alert Dialog */}
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {commonT("error") || "Error"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {errorMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialogOpen(false)}>
              {commonT("ok") || "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Alert Dialog */}
      <AlertDialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              {commonT("success") || "Success"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {successMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setSuccessDialogOpen(false)}>
              {commonT("ok") || "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Verification Animation */}
      <BackendVerifyAnimation
        show={showVerifyAnimation}
        phase={verifyPhase}
        backendName={pendingBackend?.name}
        message={verifyMessage}
        onComplete={handleVerifyComplete}
      />
    </>
  );
}
