'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { LockIcon, GlobeIcon } from './icons';

export type VisibilityType = 'private' | 'public';

const visibilities: Record<VisibilityType, { label: string; icon: ReactNode }> = {
  private: {
    label: 'Private',
    icon: <LockIcon />,
  },
  public: {
    label: 'Public',
    icon: <GlobeIcon />,
  },
};

export function VisibilitySelector({
                                     chatId,
                                     className,
                                     selectedVisibilityType,
                                   }: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
} & React.ComponentProps<typeof Button>) {
  const { visibilityType } = useChatVisibility({
    chatId,
    initialVisibility: selectedVisibilityType,
  });

  const selectedVisibility = visibilities[visibilityType as VisibilityType];

  return (
      <Button
          variant="outline"
          className={cn('hidden md:flex md:px-2 md:h-[34px]', className)}
          disabled
      >
        {selectedVisibility.icon}
        {selectedVisibility.label}
      </Button>
  );
}
