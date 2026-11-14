import type { SvgIconProps } from '@omnitron-dev/prism/ui';

import React from 'react';
import { SvgIcon } from '@omnitron-dev/prism/ui';

export function SearchIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </SvgIcon>
  );
}
export function ThemeIcon({ mode, ...props }: SvgIconProps & { mode: string }) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      {mode === 'light' ? (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </g>
      ) : mode === 'dark' ? (
        <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      ) : (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M8 21h8m-4-4v4" />
        </g>
      )}
    </SvgIcon>
  );
}
export function ArrowIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}
