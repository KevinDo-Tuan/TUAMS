import React, { useState, useEffect, useRef } from 'react';

const CLOUD_MODELS = [
  "glm-5:cloud",
  "gpt-oss:20b-cloud",
  "llama3.3:cloud",
  "phi4-mini:cloud",
  "qwen2.5:cloud",
];

interface ModelConfig {
  provider: "ollama" | "cloud";
  model: string;
  isOllama: boolean;
}

interface ModelSelectorProps {
  onModelChange?: (provider: "ollama" | "cloud", model: string) => void;
  onChatOpen?: () => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange, onChatOpen }) => {
  const [currentConfig, setCurrentConfig] = useState<ModelConfig | null>(null);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'testing' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [selectedProvider, setSelectedProvider] = useState<"ollama" | "cloud">("ollama");
  const [selectedLocalModel, setSelectedLocalModel] = useState<string>("");
  const [selectedCloudModel, setSelectedCloudModel] = useState<string>(CLOUD_MODELS[0]);
  const [ollamaUrl, setOllamaUrl] = useState<string>("http://localhost:11434");
  const ollamaUrlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      setIsLoading(true);
      const config = await window.electronAPI.getCurrentLlmConfig();
      setCurrentConfig(config);
      setSelectedProvider(config.provider);
      if (config.provider === 'cloud') {
        setSelectedCloudModel(config.model);
      } else {
        setSelectedLocalModel(config.model);
      }
      await loadLocalModels();
    } catch (error) {
      console.error('Error loading current config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocalModels = async () => {
    try {
      const models = await window.electronAPI.getAvailableOllamaModels();
      const local = models.filter((m: string) => !CLOUD_MODELS.includes(m));
      setLocalModels(local);
      if (local.length > 0 && !selectedLocalModel) {
        setSelectedLocalModel(local[0]);
      }
    } catch (error) {
      console.error('Error loading local models:', error);
      setLocalModels([]);
    }
  };

  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      const result = await window.electronAPI.testLlmConnection();
      setConnectionStatus(result.success ? 'success' : 'error');
      if (!result.success) setErrorMessage(result.error || 'Unknown error');
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(String(error));
    }
  };

  const handleApply = async () => {
    try {
      setConnectionStatus('testing');
      let result;

      if (selectedProvider === 'ollama') {
        result = await window.electronAPI.switchToOllama(selectedLocalModel, ollamaUrl);
      } else {
        result = await window.electronAPI.switchToCloud(selectedCloudModel);
      }

      if (result.success) {
        await loadCurrentConfig();
        setConnectionStatus('success');
        onModelChange?.(selectedProvider, selectedProvider === 'ollama' ? selectedLocalModel : selectedCloudModel);
        setTimeout(() => onChatOpen?.(), 500);
      } else {
        setConnectionStatus('error');
        setErrorMessage(result.error || 'Switch failed');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(String(error));
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'testing': return 'text-amber-500';
      case 'success': return 'text-emerald-500';
      case 'error': return 'text-red-500';
      default: return 'text-red-400/50';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'testing': return 'Applying...';
      case 'success': return 'Connected';
      case 'error': return `Error: ${errorMessage}`;
      default: return 'Ready';
    }
  };

  if (isLoading) {
    return (
      <div className="liquid-glass p-4">
        <div className="animate-pulse text-sm text-red-700/50">Loading model configuration...</div>
      </div>
    );
  }

  return (
    <div className="liquid-glass p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between glass-content">
        <h3 className="text-sm font-bold text-red-900/80 tracking-tight">AI Model</h3>
        <div className={`text-[11px] font-medium ${getStatusColor()} transition-colors duration-300`}>
          {getStatusText()}
        </div>
      </div>

      {/* Active Model Card */}
      {currentConfig && (
        <div className="glass-content liquid-glass-dark p-3 animate-fade-in" style={{ borderRadius: '0.75rem' }}>
          <div className="flex items-center gap-2">
            <span className="status-dot flex-shrink-0" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-red-300/70">Active</span>
          </div>
          <div className="font-mono font-bold text-sm mt-1.5 text-white/90">{currentConfig.model}</div>
          <div className="text-[10px] text-red-300/50 mt-0.5">
            {currentConfig.provider === 'ollama' ? 'Local (Ollama)' : 'Cloud (via Ollama)'}
          </div>
        </div>
      )}

      {/* Provider Toggle */}
      <div className="flex gap-1.5 glass-content p-1 bg-red-50/50 rounded-xl border border-red-200/20">
        <button
          onClick={() => setSelectedProvider('cloud')}
          className={`flex-1 px-3 py-2 rounded-[0.625rem] text-xs font-medium transition-all duration-300 ${
            selectedProvider === 'cloud'
              ? 'btn-primary shadow-md'
              : 'text-red-600/70 hover:bg-red-100/50'
          }`}
        >
          Cloud
        </button>
        <button
          onClick={() => setSelectedProvider('ollama')}
          className={`flex-1 px-3 py-2 rounded-[0.625rem] text-xs font-medium transition-all duration-300 ${
            selectedProvider === 'ollama'
              ? 'btn-primary shadow-md'
              : 'text-red-600/70 hover:bg-red-100/50'
          }`}
        >
          Local
        </button>
      </div>

      {/* Provider-specific Options */}
      <div className="glass-content space-y-2.5 animate-fade-in" key={selectedProvider}>
        {selectedProvider === 'cloud' ? (
          <>
            <div>
              <label className="text-[11px] font-semibold text-red-800/70 block mb-1.5 uppercase tracking-wider">
                Cloud Model
              </label>
              <select
                value={selectedCloudModel}
                onChange={(e) => setSelectedCloudModel(e.target.value)}
                className="glass-input w-full px-3 py-2.5 text-xs"
              >
                {CLOUD_MODELS.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
            <div className="text-[10px] text-red-600/60 bg-red-50/60 rounded-lg p-2.5 border border-red-200/20 leading-relaxed">
              Cloud models route via your local Ollama daemon. Run <span className="font-mono text-red-700/70">ollama login</span> first.
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-[11px] font-semibold text-red-800/70 block mb-1.5 uppercase tracking-wider">
                Ollama URL
              </label>
              <input
                ref={ollamaUrlRef}
                type="url"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="glass-input w-full px-3 py-2.5 text-xs"
                onMouseDown={async (e) => {
                  e.preventDefault()
                  await window.electronAPI.invoke("set-window-focusable", true)
                  ollamaUrlRef.current?.focus()
                }}
                onBlur={() => window.electronAPI.invoke("set-window-focusable", false)}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-[11px] font-semibold text-red-800/70 uppercase tracking-wider">Model</label>
                <button
                  onClick={loadLocalModels}
                  className="text-[10px] text-red-500/70 hover:text-red-600 transition-colors duration-200"
                  title="Refresh models"
                >
                  Refresh
                </button>
              </div>
              {localModels.length > 0 ? (
                <select
                  value={selectedLocalModel}
                  onChange={(e) => setSelectedLocalModel(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-xs"
                >
                  {localModels.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-red-600/60 bg-red-50/60 p-2.5 rounded-lg border border-red-200/20">
                  No local models found. Make sure Ollama is running.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 glass-content">
        <button
          onClick={handleApply}
          disabled={connectionStatus === 'testing'}
          className="btn-primary flex-1 px-3 py-2.5 text-xs rounded-xl disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
        >
          {connectionStatus === 'testing' ? 'Applying...' : 'Apply'}
        </button>
        <button
          onClick={testConnection}
          disabled={connectionStatus === 'testing'}
          className="glass-btn px-3 py-2.5 text-xs rounded-xl bg-red-100/60 border-red-200/30 text-red-700/80 hover:bg-red-200/60 hover:text-red-800 disabled:opacity-40"
        >
          Test
        </button>
      </div>
    </div>
  );
};

export default ModelSelector;
