import { useSettingsStore } from '../stores/useSettingsStore.ts';

export default function SelfLoveCoach() {
  const {
    selfLoveEnabled,
    setSelfLoveEnabled,
    selfLoveTtsEnabled,
    setSelfLoveTtsEnabled,
    selfLoveLines,
  } = useSettingsStore();

  return (
    <div className={`bg-slate-900/40 rounded-2xl p-6 border ${selfLoveEnabled ? 'border-pink-500/60' : 'border-slate-800'} backdrop-blur-xl transition-colors duration-500`}>
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Self-Love Coach</h3>

      {/* Toggles */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">Enable</span>
          <button
            onClick={() => setSelfLoveEnabled(!selfLoveEnabled)}
            className={`w-10 h-5 rounded-full transition-colors duration-300 relative ${
              selfLoveEnabled ? 'bg-pink-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${
                selfLoveEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-400 text-xs">TTS Voice</span>
          <button
            onClick={() => setSelfLoveTtsEnabled(!selfLoveTtsEnabled)}
            className={`w-10 h-5 rounded-full transition-colors duration-300 relative ${
              selfLoveTtsEnabled ? 'bg-pink-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform duration-300 ${
                selfLoveTtsEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Message List */}
      <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
        {selfLoveLines.length === 0 ? (
          <p className="text-slate-600 text-xs italic text-center py-4">
            {selfLoveEnabled ? 'Waiting for encouragement...' : 'Enable to receive affirmations'}
          </p>
        ) : (
          selfLoveLines.map((line, i) => (
            <div
              key={i}
              className="bg-black/40 rounded-xl border border-pink-500/20 p-3 text-pink-300 text-xs leading-relaxed"
            >
              💗 {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
