import React from 'react';
import { 
  Megaphone, X, ShieldAlert, AlertTriangle, 
  Info, CheckCircle2, Clock, Check
} from 'lucide-react';
import { sound } from '../../services/sound';

export interface ActiveAnnouncement {
  id: number;
  title: string;
  content: string;
  banner_type: 'info' | 'warning' | 'urgent' | 'success';
  show_as_popup: boolean;
  dismissible: boolean;
  created_at?: string;
  expires_at?: string;
}

interface BroadcastAnnouncementModalProps {
  announcement: ActiveAnnouncement | null;
  onDismiss: (id: number) => void;
}

export const BroadcastAnnouncementModal: React.FC<BroadcastAnnouncementModalProps> = ({
  announcement,
  onDismiss
}) => {
  if (!announcement) return null;

  const handleDismiss = () => {
    sound.beep();
    onDismiss(announcement.id);
  };

  const getStyleTheme = () => {
    switch (announcement.banner_type) {
      case 'urgent':
        return {
          border: 'border-red-500/50',
          bgHeader: 'bg-red-500/10 text-red-400',
          btnBg: 'bg-red-600 hover:bg-red-500 text-white',
          icon: <ShieldAlert className="w-6 h-6 text-red-500" />
        };
      case 'warning':
        return {
          border: 'border-amber-500/50',
          bgHeader: 'bg-amber-500/10 text-amber-400',
          btnBg: 'bg-amber-600 hover:bg-amber-500 text-white',
          icon: <AlertTriangle className="w-6 h-6 text-amber-500" />
        };
      case 'success':
        return {
          border: 'border-emerald-500/50',
          bgHeader: 'bg-emerald-500/10 text-emerald-400',
          btnBg: 'bg-emerald-600 hover:bg-emerald-500 text-white',
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        };
      default:
        return {
          border: 'border-blue-500/50',
          bgHeader: 'bg-blue-500/10 text-blue-400',
          btnBg: 'bg-blue-600 hover:bg-blue-500 text-white',
          icon: <Info className="w-6 h-6 text-blue-500" />
        };
    }
  };

  const theme = getStyleTheme();

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className={`bg-white dark:bg-slate-900 border ${theme.border} rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleUp`}>
        
        {/* Header */}
        <div className={`p-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 ${theme.bgHeader}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/20 dark:bg-black/20">
              {theme.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/20">
                  Merkezi Duyuru
                </span>
                <span className="text-xs font-bold opacity-80 flex items-center gap-1">
                  <Megaphone className="w-3 h-3" />
                  BonCore SaaS
                </span>
              </div>
              <h3 className="font-black text-slate-900 dark:text-white text-base sm:text-lg mt-0.5">
                {announcement.title}
              </h3>
            </div>
          </div>

          {announcement.dismissible && (
            <button 
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/10 transition cursor-pointer"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 font-medium">
            {announcement.content}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{announcement.created_at ? new Date(announcement.created_at).toLocaleString('tr-TR') : 'Canlı Bildirim'}</span>
            </div>

            {announcement.dismissible && (
              <button
                onClick={handleDismiss}
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-black text-xs shadow-md transition cursor-pointer ${theme.btnBg}`}
              >
                <Check className="w-4 h-4" />
                <span>Okudum & Kapat</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
