
import React, { useState, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { ReportCard } from './components/ReportCard';
import { SummaryView } from './components/SummaryView';
import { StatsChart } from './components/StatsChart';
import { AnalysisDashboard } from './components/AnalysisDashboard';
import { ServerSyncConfig } from './components/ServerSyncConfig';
import { extractDataFromImage } from './services/geminiService';
import { fetchReportsFromServer, saveReportsToServer } from './services/apiService';
import { FlightReport } from './types';
import { Plane, AlertCircle, Trash2, Download, Upload as UploadIcon, Database, RefreshCw, Loader2 } from 'lucide-react';

const STORAGE_KEY = 'aerolog_data_v1';
const SERVER_URL_KEY = 'aerolog_server_url';

const App: React.FC = () => {
  const [reports, setReports] = useState<FlightReport[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  
  // Server Sync State
  const [serverUrl, setServerUrl] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  // To prevent auto-save triggering immediately after auto-load
  const isInitialLoad = useRef(true);

  // 1. Initialize: Load Server URL and Local Data
  useEffect(() => {
    const savedUrl = localStorage.getItem(SERVER_URL_KEY);
    if (savedUrl) setServerUrl(savedUrl);

    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        setReports(JSON.parse(savedData));
      } catch (e) {
        console.error("Failed to load local data", e);
      }
    }
    
    // If we have a server URL, trigger initial fetch immediately
    if (savedUrl) {
      handleServerFetch(savedUrl);
    } else {
      isInitialLoad.current = false;
    }
  }, []);

  // 2. Fetch Data from Server (Auto-download on startup)
  const handleServerFetch = async (url: string) => {
    if (!url) return;
    setSyncStatus('syncing');
    try {
      const serverReports = await fetchReportsFromServer(url);
      if (serverReports && serverReports.length > 0) {
        setReports(serverReports);
        // Update local storage to match server
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverReports));
      }
      setSyncStatus('synced');
      setLastSyncTime(Date.now());
    } catch (err) {
      console.error("Server Fetch Error:", err);
      setSyncStatus('error');
    } finally {
      isInitialLoad.current = false;
    }
  };

  // 3. Auto-save to Server & LocalStorage when reports change
  useEffect(() => {
    // Save to LocalStorage (Always)
    if (reports.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    }

    // Save to Server (If configured and not initial load)
    if (serverUrl && !isInitialLoad.current) {
      const timeoutId = setTimeout(() => {
        setSyncStatus('syncing');
        saveReportsToServer(serverUrl, reports)
          .then(() => {
            setSyncStatus('synced');
            setLastSyncTime(Date.now());
          })
          .catch(() => setSyncStatus('error'));
      }, 1000); // Debounce for 1 second

      return () => clearTimeout(timeoutId);
    }
  }, [reports, serverUrl]);

  // Handle URL Change
  const handleUrlChange = (newUrl: string) => {
    setServerUrl(newUrl);
    localStorage.setItem(SERVER_URL_KEY, newUrl);
    if (newUrl) {
      handleServerFetch(newUrl);
    } else {
        setSyncStatus('idle');
    }
  };

  const handleFileSelect = async (files: File[]) => {
    setIsProcessing(true);
    setError(null);
    let errorCount = 0;
    let successCount = 0;

    // Process sequentially to avoid API Rate Limits (429 Quota Exceeded)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatus(`Analyzing ${i + 1} of ${files.length}...`);
      
      try {
        const newReport = await extractDataFromImage(file);
        setReports(prev => [newReport, ...prev]);
        successCount++;
      } catch (err: any) {
        console.error(`Error processing file ${file.name}:`, err);
        errorCount++;
        // Optional: Add a small error to the state but don't stop the whole process
      }
    }

    setProcessingStatus("");
    setIsProcessing(false);

    if (errorCount > 0) {
      setError(`Completed with issues: ${successCount} processed, ${errorCount} failed.`);
    }
  };

  const handleRemoveReport = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
  };

  const handleClearAll = () => {
    if(window.confirm("Delete all data? This will clear local and server data.")) {
        setReports([]);
        localStorage.removeItem(STORAGE_KEY);
        setError(null);
    }
  };

  // --- Import/Export ---
  const handleDownloadBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reports, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const date = new Date().toISOString().split('T')[0];
    downloadAnchorNode.setAttribute("download", `aerolog_backup_${date}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleTriggerImport = () => fileInputRef.current?.click();

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = event.target.files?.[0];
    if (!file) return;

    fileReader.readAsText(file, "UTF-8");
    fileReader.onload = e => {
      try {
        const content = e.target?.result as string;
        const parsedData = JSON.parse(content) as FlightReport[];
        if (Array.isArray(parsedData)) {
            if (window.confirm(`Found ${parsedData.length} reports. Replace current data?`)) {
                setReports(parsedData);
            }
        }
      } catch (err) {
        alert("Error parsing backup file.");
      }
    };
    event.target.value = '';
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-aviation-600 p-2 rounded-lg">
                <Plane className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight hidden sm:block">AeroLog AI</h1>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight sm:hidden">AeroLog</h1>
          </div>
          
          <div className="flex items-center gap-2">
             <ServerSyncConfig 
                serverUrl={serverUrl}
                setServerUrl={handleUrlChange}
                syncStatus={syncStatus}
                lastSyncTime={lastSyncTime}
                onManualSync={() => handleServerFetch(serverUrl)}
             />
             
             <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1"></div>

             <button 
                onClick={handleTriggerImport}
                className="p-2 text-slate-500 hover:text-aviation-600 hover:bg-slate-100 rounded-full transition-colors hidden sm:block"
                title="Import Local Backup"
             >
                <UploadIcon className="w-5 h-5" />
             </button>
             <button 
                onClick={handleDownloadBackup}
                disabled={reports.length === 0}
                className="p-2 text-slate-500 hover:text-aviation-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-30 hidden sm:block"
                title="Download Local Backup"
             >
                <Download className="w-5 h-5" />
             </button>
             
             <input type="file" ref={fileInputRef} onChange={handleImportBackup} className="hidden" accept=".json" />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        
        {reports.length === 0 && !isProcessing && !error && (
            <div className="mb-8 text-center py-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload PFR Photos</h2>
                <p className="text-slate-500 max-w-md mx-auto mb-6">
                    Take a photo of the thermal paper printout. AI will extract faults and prepare your handover summary.
                </p>
                <div className="flex items-center justify-center gap-4 text-xs">
                    <div className="inline-flex items-center gap-2 text-slate-400 bg-slate-50 px-3 py-2 rounded border border-slate-200">
                        <Database className="w-3 h-3" />
                        Local Storage Ready
                    </div>
                    {serverUrl && (
                        <div className="inline-flex items-center gap-2 text-green-600 bg-green-50 px-3 py-2 rounded border border-green-200">
                            <RefreshCw className="w-3 h-3" />
                            Auto-Sync Active
                        </div>
                    )}
                </div>
            </div>
        )}

        <div className="mb-8 relative">
          <FileUpload onFileSelect={handleFileSelect} isProcessing={isProcessing} />
          
          {isProcessing && processingStatus && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-20 border border-aviation-100">
              <div className="flex flex-col items-center">
                 <Loader2 className="w-8 h-8 text-aviation-600 animate-spin mb-2" />
                 <p className="text-sm font-medium text-aviation-800 animate-pulse">{processingStatus}</p>
                 <p className="text-xs text-slate-500 mt-1">Processing sequentially to optimize quota...</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3 border border-red-200">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
                <p className="font-medium">Processing Error</p>
                <p className="text-sm opacity-90">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-sm underline hover:text-red-800">Dismiss</button>
          </div>
        )}

        {reports.length > 0 && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800">
                    Fleet Analysis <span className="text-slate-400 font-normal ml-1">({reports.length} Records)</span>
                </h2>
                <button onClick={handleClearAll} className="text-red-500 hover:text-red-600 text-sm flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded transition-colors">
                    <Trash2 className="w-4 h-4" /> Clear All
                </button>
            </div>

            <AnalysisDashboard reports={reports} />
            <StatsChart reports={reports} />

            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 mt-8">Report History</h3>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
                {reports.map(report => (
                <ReportCard key={report.id} report={report} onRemove={handleRemoveReport} />
                ))}
            </div>

            <SummaryView reports={reports} />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
