"use client";

import React, { useState } from "react";
import { createVolunteer } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { UserPlus, Shield, MapPin, Zap } from "lucide-react";

export default function VolunteerRegistration({ onSuccess }: { onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    skills: "",
    location_name: "Operations Center",
    lat: 12.9716, // Default to Bangalore center for demo
    lng: 77.5946
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.name.length < 2) {
      toast("Operative name too short.", "error");
      return;
    }
    if (!formData.skills.trim()) {
      toast("Specializations required for deployment.", "error");
      return;
    }

    setLoading(true);
    try {
      const skillsArray = formData.skills.split(",").map(s => s.trim()).filter(s => s !== "");
      await createVolunteer({
        ...formData,
        skills: skillsArray
      });
      toast("Operative registered in Neural Grid.", "success");
      setIsOpen(false);
      setFormData({
        name: "",
        phone: "",
        skills: "",
        location_name: "Operations Center",
        lat: 12.9716,
        lng: 77.5946
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      toast("Registration failed. Data sync error.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4">
      {!isOpen ? (
        <button 
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900/50 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:border-neon-cyan/50 hover:bg-neon-cyan/5 transition-all group shadow-lg underline-offset-4"
        >
          <UserPlus size={16} className="group-hover:text-neon-cyan" />
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase">Deploy New Operative</span>
        </button>
      ) : (
        <div className="hud-panel p-5 rounded-xl border border-neon-cyan/30 animate-[slice-in_0.3s_each-out]">
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
            <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-neon-cyan flex items-center gap-2">
              <Shield size={14} />
              Operative Enrollment
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-[10px] text-slate-500 hover:text-white uppercase font-mono tracking-tighter">Abort [ESC]</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between items-center px-1">
                <label className="text-[8px] uppercase font-mono text-slate-500 tracking-widest text-[7px]">Full Name</label>
                <span className={`text-[7px] font-mono ${formData.name.length > 50 ? 'text-neon-red' : 'text-slate-600'}`}>{formData.name.length}/50</span>
              </div>
              <input 
                type="text" 
                placeholder="Operative ID/Name"
                maxLength={50}
                className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-xs text-white focus:border-neon-cyan/50 outline-none font-mono tracking-tight ${formData.name.length > 50 ? 'border-neon-red' : 'border-slate-800'}`}
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center px-1">
                <label className="text-[8px] uppercase font-mono text-slate-500 tracking-widest text-[7px]">Specializations (Comma Separated)</label>
                <span className={`text-[7px] font-mono ${formData.skills.length > 100 ? 'text-neon-red' : 'text-slate-600'}`}>{formData.skills.length}/100</span>
              </div>
              <input 
                type="text" 
                placeholder="e.g. MEDICAL, DRIVER, RESCUE"
                maxLength={100}
                className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-xs text-white focus:border-neon-cyan/50 outline-none font-mono tracking-tight uppercase ${formData.skills.length > 100 ? 'border-neon-red' : 'border-slate-800'}`}
                value={formData.skills}
                onChange={(e) => setFormData({...formData, skills: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
               <div className="space-y-1">
                 <label className="text-[8px] uppercase font-mono text-slate-500 tracking-widest pl-1">Assigned Quadrant</label>
                 <div className="relative">
                   <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neon-cyan/50" size={12} />
                   <input 
                     type="text" 
                     className="w-full bg-black/40 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-[10px] text-white focus:border-neon-cyan/50 outline-none font-mono"
                     value={formData.location_name}
                     onChange={(e) => setFormData({...formData, location_name: e.target.value})}
                   />
                 </div>
               </div>
               <div className="space-y-1">
                 <label className="text-[8px] uppercase font-mono text-slate-500 tracking-widest pl-1">Sync Priority</label>
                 <div className="relative">
                   <Zap className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neon-orange/50" size={12} />
                   <div className="w-full bg-black/40 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-[10px] text-slate-400 font-mono italic">
                     ALPHA-7
                   </div>
                 </div>
               </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/50 text-neon-cyan py-3 rounded-lg text-[10px] font-black tracking-[0.3em] uppercase transition-all shadow-[0_0_15px_rgba(0,243,255,0.1)] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Syncing Biometrics..." : "Confirm Deployment"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
