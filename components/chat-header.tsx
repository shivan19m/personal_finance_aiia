'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';
import { usePlaidLink } from 'react-plaid-link';
import { useSession } from 'next-auth/react';

import { ModelSelector } from '@/components/model-selector';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { VisibilityType, VisibilitySelector } from './visibility-selector';

function PureChatHeader({
                          chatId,
                          selectedModelId,
                          selectedVisibilityType,
                          isReadonly,
                        }: {
  chatId: string;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();
  const { open: sidebarOpen } = useSidebar(); // ✅ Rename this to avoid conflict
  const { width: windowWidth } = useWindowSize();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const { data: session } = useSession();
  const userEmail = session?.user?.email || "unknown_user"; // ✅ Fallback if session isn't ready

  // 🔹 Fetch Plaid Link Token
  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const res = await fetch("/api/create_link_token", { method: "POST" });
        const data = await res.json();
        setLinkToken(data.link_token);
      } catch (err) {
        console.error("Error fetching Plaid Link token:", err);
      }
    };
    fetchLinkToken();
  }, []);

  // 🔹 Plaid Link Hook
  const { open: openPlaid, ready } = usePlaidLink({
    token: linkToken!,
    onSuccess: async (public_token) => {
      try {
        const res = await fetch("/api/plaid/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token, user_id: userEmail }),
        });

        const data = await res.json();
        if (data.success) {
          setIsConnected(true);
        }
      } catch (err) {
        console.error("Plaid Auth Error:", err);
      }
    },
  });

  return (
      <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2">
        <SidebarToggle />

        {(!sidebarOpen || windowWidth < 768) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                    variant="outline"
                    className="order-2 md:order-1 md:px-2 px-2 md:h-fit ml-auto md:ml-0"
                    onClick={() => {
                      router.push('/');
                      router.refresh();
                    }}
                >
                  <PlusIcon />
                  <span className="md:sr-only">New Chat</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Chat</TooltipContent>
            </Tooltip>
        )}

        {!isReadonly && (
            <ModelSelector
                selectedModelId={selectedModelId}
                className="order-1 md:order-2"
            />
        )}

        {!isReadonly && (
            <VisibilitySelector
                chatId={chatId}
                selectedVisibilityType={selectedVisibilityType}
                className="order-1 md:order-3"
            />
        )}

        <Button
            onClick={() => openPlaid()} // ✅ Fix: Ensure onClick gets a function
            disabled={!ready}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 order-4 md:ml-auto"
        >
          {isConnected ? "✅ Bank Linked" : "Connect Bank Account"}
        </Button>
      </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return prevProps.selectedModelId === nextProps.selectedModelId;
});