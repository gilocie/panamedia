import React, { useEffect, useState } from 'react';

interface SpeedGraphProps {
  currentSpeed: number; // in B/s
  isActive: boolean;
}

export const SpeedGraph: React.FC<SpeedGraphProps> = ({ currentSpeed, isActive }) => {
  const [history, setHistory] = useState<number[]>(Array(30).fill(0));

  useEffect(() => {
    let interval: any;
    if (isActive) {
      interval = setInterval(() => {
        setHistory((prev) => {
          const next = [...prev.slice(1), currentSpeed];
          return next;
        });
      }, 1000);
    } else {
      setHistory(Array(30).fill(0));
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, currentSpeed]);

  const maxVal = Math.max(...history, 1024 * 1024); // Minimum 1MB/s scale
  const width = 280;
  const height = 110;
  const padding = 10;

  // Generate SVG Path
  const points = history.map((val, index) => {
    const x = padding + (index / (history.length - 1)) * (width - padding * 2);
    const y = height - padding - (val / maxVal) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = points.length > 0 ? `M ${points.join(' L ')}` : '';
  // Area path for gradient fill
  const areaD = points.length > 0
    ? `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`
    : '';

  // Format Y-axis labels
  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec >= 1024 * 1024) {
      return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
    }
    return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
  };

  return (
    <div className="chart-container">
      <div style={{ position: 'absolute', top: '8px', left: '12px', fontSize: '10px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', width: '90%' }}>
        <span>Real-time Speed</span>
        <span>Max: {formatSpeed(maxVal)}</span>
      </div>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Grid lines */}
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.05)" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(255,255,255,0.03)" />
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="rgba(255,255,255,0.03)" />

        {/* Area fill */}
        {areaD && <path d={areaD} fill="url(#graphGradient)" />}

        {/* Path line */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="url(#primaryGradientPath)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <linearGradient id="primaryGradientPath" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>

        {/* Current point highlight */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].split(',')[0]}
            cy={points[points.length - 1].split(',')[1]}
            r="4"
            fill="#a855f7"
            stroke="#fff"
            strokeWidth="1.5"
            style={{ filter: 'drop-shadow(0 0 4px var(--primary))' }}
          />
        )}
      </svg>
    </div>
  );
};
