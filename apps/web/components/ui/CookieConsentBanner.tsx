"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function CookieConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cookie_consent")) {
      setShow(true);
    }
  }, []);

  const handleDecision = (accepted: boolean) => {
    localStorage.setItem("cookie_consent", accepted ? "accepted" : "rejected");
    setShow(false);

    if (accepted) {
      window.dispatchEvent(new Event("cookies-accepted"));
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
        >
          <div className="max-w-5xl mx-auto rounded-xl shadow-2xl p-5 border flex flex-col sm:flex-row items-center gap-4 justify-between"
            style={{ background: "rgba(17,17,17,0.85)", backdropFilter: "blur(12px)", borderColor: "rgba(255,255,255,0.15)" }}>
            
            <div className="text-sm text-gray-300">
              <span className="font-bold text-white tracking-widest text-xs uppercase mb-1 block">Your Privacy</span>
              We use strictly necessary cookies to power core platform sessions. We also use optional analytics cookies to improve our platform. You can reject these non-essential cookies without affecting your experience. 
            </div>

            <div className="flex gap-3 shrink-0 mt-3 sm:mt-0 w-full sm:w-auto">
              <button
                onClick={() => handleDecision(false)}
                className="flex-1 sm:flex-none px-4 py-2 border border-gray-600 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition"
              >
                Reject Non-Essential
              </button>
              <button
                onClick={() => handleDecision(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-green-600 rounded-lg text-sm text-white font-bold hover:bg-green-700 transition shadow-lg"
              >
                Accept All
              </button>
            </div>

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}