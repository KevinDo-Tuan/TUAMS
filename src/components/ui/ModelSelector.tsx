import React, { useState, useEffect } from 'react';

interface ModelConfig {
  provider: "ollama" | "gemini";
  model: string;
  isOllama: boolean;
}

interface ModelSelectorProps {
  onModelChange?: (provider: "ollama" | "gemini", model: string) => void;
  onChatOpen?: () => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ onModelChange, onChatOpen }) => {
  const [currentConfig, setCurrentConfig] = useState<ModelConfig | null>(null);
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'testing' | 'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<"ollama" | "gemini">("gemini");
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>("");
  const [ollamaUrl, setOllamaUrl] = useState<string>("http://localhost:11434");

  useEffect(() => {
    loadCurrentConfig();
  }, []);

  const loadCurrentConfig = async () => {
    try {
      setIsLoading(true);
      const config = await window.electronAPI.getCurrentLlmConfig();
      setCurrentConfig(config);
      setSelectedProvider(config.provider);

      if (config.isOllama) {
        setSelectedOllamaModel(config.model);
        await loadOllamaModels();
      }
    } catch (error) {
      console.error('Error loading current config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const models = await window.electronAPI.getAvailableOllamaModels();
      setAvailableOllamaModels(models);

      if (models.length > 0 && !selectedOllamaModel) {
        setSelectedOllamaModel(models[0]);
      }
    } catch (error) {
      console.error('Error loading Ollama models:', error);
      setAvailableOllamaModels([]);
    }
  };

  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      const result = await window.electronAPI.testLlmConnection();
      setConnectionStatus(result.success ? 'success' : 'error');
      if (!result.success) {
        setErrorMessage(result.error || 'Unknown error');
      }
    } catch (error) {
      setConnectionStatus('error');
      setErrorMessage(String(error));
    }
  };

  const handleProviderSwitch = async () => {
    try {
      setConnectionStatus('testing');
      let result;

      if (selectedProvider === 'ollama') {
        result = await window.electronAPI.switchToOllama(selectedOllamaModel, ollamaUrl);
      } else {
        result = await window.electronAPI.switchToGemini(geminiApiKey || undefined);
      }

      if (result.success) {
        await loadCurrentConfig();
        setConnectionStatus('success');
        onModelChange?.(selectedProvider, selectedProvider === 'ollama' ? selectedOllamaModel : 'gemini-2.0-flash');
        setTimeout(() => {
          onChatOpen?.();
        }, 500);
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
      case 'testing': return 'text-yellow-400';
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-white/50';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'testing': return 'Testing...';
      case 'success': return 'Connected';
      case 'error': return `Error: ${errorMessage}`;
      default: return 'Ready';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
        <div className="text-xs text-white/50">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-white/90 tracking-wide">Model Settings</h3>
        <span className={`text-[10px] ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Current Status */}
      {currentConfig && (
        <div className="text-[10px] text-white/50 bg-white/5 px-3 py-1.5 rounded border border-white/5">
          Active: <span className="text-white/70 font-medium">{currentConfig.provider === 'ollama' ? 'Local' : 'Cloud'} / {currentConfig.model}</span>
        </div>
      )}

      {/* Provider Selection */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-medium text-white/60 tracking-wide uppercase">Provider</label>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedProvider('gemini')}
            className={`flex-1 px-3 py-1.5 rounded text-[11px] font-medium transition-all ${
              selectedProvider === 'gemini'
                ? 'bg-blue-500/80 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            Gemini (Cloud)
          </button>
          <button
            onClick={() => setSelectedProvider('ollama')}
            className={`flex-1 px-3 py-1.5 rounded text-[11px] font-medium transition-all ${
              selectedProvider === 'ollama'
                ? 'bg-emerald-500/80 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            Ollama (Local)
          </button>
        </div>
      </div>

      {/* Provider-specific settings */}
      {selectedProvider === 'gemini' ? (
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-white/60 tracking-wide uppercase">API Key (optional if set)</label>
          <input
            type="password"
            placeholder="Enter API key..."
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            className="w-full px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-white/90 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-blue-400/40"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-medium text-white/60 tracking-wide uppercase">Ollama URL</label>
            <input
              type="url"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-white/90 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-medium text-white/60 tracking-wide uppercase">Model</label>
              <button
                onClick={loadOllamaModels}
                className="px-2 py-0.5 text-[10px] bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 rounded transition-all font-medium"
              >
                Refresh
              </button>
            </div>

            {availableOllamaModels.length > 0 ? (
              <select
                value={selectedOllamaModel}
                onChange={(e) => setSelectedOllamaModel(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-white/90 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
              >
                {availableOllamaModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-[10px] text-yellow-400/70 bg-yellow-500/10 p-2 rounded border border-yellow-500/20">
                No models found. Ensure Ollama is running.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleProviderSwitch}
          disabled={connectionStatus === 'testing'}
          className="flex-1 px-3 py-1.5 bg-blue-500/80 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/30 text-white text-[11px] font-medium rounded transition-all"
        >
          {connectionStatus === 'testing' ? 'Switching...' : 'Apply'}
        </button>
        <button
          onClick={testConnection}
          disabled={connectionStatus === 'testing'}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/20 text-white/70 text-[11px] font-medium rounded transition-all"
        >
          Test
        </button>
      </div>

      {/* Help text */}
      <div className="text-[10px] text-white/40 space-y-0.5 pt-1 border-t border-white/5">
        <div><span className="text-white/50 font-medium">Gemini</span> &mdash; Cloud-based, requires API key</div>
        <div><span className="text-white/50 font-medium">Ollama</span> &mdash; Private, local, requires installation</div>
      </div>
    </div>
  );
};

export default ModelSelector;
