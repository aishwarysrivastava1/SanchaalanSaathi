import { Home, User, Trophy } from "lucide-react";

export default function VolunteerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto bg-slate-900 shadow-2xl overflow-hidden relative">
      {/* Top Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex items-center shrink-0">
        <span className="text-sm font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-green-500 font-mono">
          SYNAPSE<span className="text-slate-500">_FIELD</span>
        </span>
      </header>

      <div className="flex-1 overflow-y-auto pb-16">
        {children}
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="absolute bottom-0 w-full bg-slate-950 border-t border-slate-800 flex justify-around p-3 z-50">
        <a href="/feed" className="flex flex-col items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors">
          <Home size={18} />
          <span className="text-[10px] font-medium">Feed</span>
        </a>
        <a href="/leaderboard" className="flex flex-col items-center gap-1 text-slate-400 hover:text-neon-orange transition-colors">
          <Trophy size={18} />
          <span className="text-[10px] font-medium">Ranks</span>
        </a>
        <a href="/profile" className="flex flex-col items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors">
          <User size={18} />
          <span className="text-[10px] font-medium">Profile</span>
        </a>
      </nav>
    </div>
  );
}
