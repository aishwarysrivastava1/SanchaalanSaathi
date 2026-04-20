"use client";

import React, { useState } from "react";
import { createVolunteer } from "../../lib/api";
import { useToast } from "../../hooks/useToast";
import { useGeolocation } from "../../hooks/useGeolocation";
import { UserPlus, MapPin } from "lucide-react";

export default function VolunteerRegistration({ onSuccess }: { onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    skills: "",
    location_name: "Operations Center",
    lat: 12.9716,
    lng: 77.5946,
  });
  const { toast } = useToast();
  const { requestLocation } = useGeolocation();

  const handleOpen = async () => {
    setIsOpen(true);
    const coords = await requestLocation();
    if (coords) {
      setFormData((prev) => ({ ...prev, lat: coords.lat, lng: coords.lng }));
      setShowManualCoords(false);
      setLocationNote(null);
    } else {
      setLocationNote("Location not detected — using default coordinates");
      setShowManualCoords(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || formData.name.length < 2) {
      toast("Name too short.", "error");
      return;
    }
    if (!formData.skills.trim()) {
      toast("Skills are required.", "error");
      return;
    }

    setLoading(true);
    try {
      const skillsArray = formData.skills.split(",").map((s) => s.trim()).filter((s) => s !== "");
      await createVolunteer({ ...formData, skills: skillsArray });
      toast("Volunteer registered successfully.", "success");
      setIsOpen(false);
      setLocationNote(null);
      setShowManualCoords(false);
      setFormData({
        name: "",
        phone: "",
        skills: "",
        location_name: "Operations Center",
        lat: 12.9716,
        lng: 77.5946,
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      toast("Registration failed. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3">
      {!isOpen ? (
        <button
          onClick={handleOpen}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-gray-500 hover:text-[#115E54] hover:border-[#115E54]/40 hover:bg-[#115E54]/4 dark:hover:bg-[#115E54]/10 transition-all text-sm font-medium shadow-sm glass-card group"
        >
          <UserPlus size={15} className="group-hover:scale-110 transition-transform" />
          Register Volunteer
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm w-full glass-card hover:shadow-md transition-shadow">
          <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Register Volunteer</h3>
            <button
              onClick={() => { setIsOpen(false); setLocationNote(null); setShowManualCoords(false); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Cancel
            </button>
          </div>

          {locationNote && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-lg px-3 py-2 mb-4">
              {locationNote}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Full Name</label>
                <span className={`text-[10px] ${formData.name.length > 50 ? "text-red-500" : "text-gray-400"}`}>
                  {formData.name.length}/50
                </span>
              </div>
              <input
                type="text"
                placeholder="Volunteer name"
                maxLength={50}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:border-[#115E54]/40 outline-none placeholder-gray-400 transition-all"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-gray-600">Skills (comma separated)</label>
                <span className={`text-[10px] ${formData.skills.length > 100 ? "text-red-500" : "text-gray-400"}`}>
                  {formData.skills.length}/100
                </span>
              </div>
              <input
                type="text"
                placeholder="e.g. First Aid, Driving, Rescue"
                maxLength={100}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:border-[#115E54]/40 outline-none placeholder-gray-400"
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Location Name</label>
                <div className="relative">
                  <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#115E54]/50" size={12} />
                  <input
                    type="text"
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg pl-8 pr-3 py-2 text-xs text-gray-800 dark:text-gray-100 focus:border-[#115E54]/40 outline-none"
                    value={formData.location_name}
                    onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Priority</label>
                <div className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                  ALPHA-7
                </div>
              </div>
            </div>

            {showManualCoords && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 focus:border-[#115E54]/40 outline-none"
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-800 focus:border-[#115E54]/40 outline-none"
                    value={formData.lng}
                    onChange={(e) => setFormData({ ...formData, lng: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#115E54] hover:bg-[#0d4a42] text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 mt-1"
            >
              {loading ? "Registering..." : "Register Volunteer"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
