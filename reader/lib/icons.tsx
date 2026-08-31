import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'bookmark'
  | 'search'
  | 'settings'
  | 'help'
  | 'sun'
  | 'moon'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'close'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'plus'
  | 'minus'
  | 'arrow-right';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName;
  size?: number;
};

const paths: Record<IconName, ReactNode> = {
  bookmark: <path d="M6 3.75h12a1 1 0 0 1 1 1v15.5l-7-3.7-7 3.7V4.75a1 1 0 0 1 1-1Z" />,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.25 4.25" /></>,
  settings: <><path d="M4 7h6M14 7h6M4 17h3M11 17h9" /><circle cx="12" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.4a2.45 2.45 0 1 1 3.45 2.24c-.8.39-1.15.85-1.15 1.76M12 16.9h.01" /></>,
  sun: <><circle cx="12" cy="12" r="3.25" /><path d="M12 2.5v2M12 19.5v2M4.58 4.58l1.42 1.42M18 18l1.42 1.42M2.5 12h2M19.5 12h2M4.58 19.42 6 18M18 6l1.42-1.42" /></>,
  moon: <path d="M19.3 15.2A7.8 7.8 0 0 1 8.8 4.7 8.5 8.5 0 1 0 19.3 15.2Z" />,
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  restore: <><path d="M8 8h10a1 1 0 0 1 1 1v10" /><path d="M5 5h10a1 1 0 0 1 1 1v10H6a1 1 0 0 1-1-1V5Z" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  'chevron-up': <path d="m6 14 6-6 6 6" />,
  'chevron-down': <path d="m6 10 6 6 6-6" />,
  'chevron-left': <path d="m14 6-6 6 6 6" />,
  'chevron-right': <path d="m10 6 6 6-6 6" />,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <path d="M5 12h14" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
};

export function Icon({ name, size = 16, strokeWidth = 1.7, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
