import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
}

export function Skeleton({ className = "", width, height, borderRadius }: SkeletonProps) {
  return (
    <div
      className={`animate-shimmer overflow-hidden bg-gray-200 dark:bg-gray-800 ${className}`}
      style={{
        width: width ?? "100%",
        height: height ?? "1rem",
        borderRadius: borderRadius ?? "0.5rem",
      }}
    >
      <div className="h-full w-full bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
    </div>
  );
}

export function SkeletonCircle({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <Skeleton
      width={size}
      height={size}
      borderRadius="50%"
      className={className}
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="0.75rem"
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}
