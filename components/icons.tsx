'use client';

import React from 'react';

type IconProps = { className?: string; size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const CameraIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export const UploadIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const DownloadIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const ShareIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

export const GridIcon = ({ className, size = 24, cols = 2 }: IconProps & { cols?: number }) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="3" width={cols === 1 ? 18 : 7} height="18" rx="1" />
    {cols >= 2 && <rect x="14" y="3" width="7" height="18" rx="1" />}
    {cols >= 3 && <rect x="3" y="14" width="7" height="7" rx="1" />}
  </svg>
);

export const CheckIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const LinkIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const XIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const FlipIcon = ({ className, size = 24 }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 7v5h5" />
    <path d="M3.51 12a9 9 0 1 0 2.13-5.36L3 9" />
  </svg>
);
