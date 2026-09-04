import { Share, SquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAuth } from "@/hooks/useAuth";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

/**
 * The one ask to put this console on a phone's home screen.
 *
 * Only signed-in members ever see it. This is an internal tool, so a visitor on
 * the marketing site has nothing to install.
 */
const InstallPrompt = () => {
  const { user } = useAuth();
  const { visible, platform, install, dismiss } = useInstallPrompt(Boolean(user));

  if (!visible || platform === null) return null;

  const isIos = platform === "ios";

  return (
    <Drawer
      open
      // Covers the swipe down, the tap outside, and Escape. All three mean "not
      // now", and all three should buy the same quiet.
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DrawerContent
        // z-60 clears AccountPanel's floating button (z-55, AccountPanel.tsx:88),
        // which is pinned bottom-right and otherwise lands on top of these buttons.
        className="z-[60] mx-auto max-w-md"
        data-testid="install-prompt"
        data-platform={platform}
      >
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-3">
            <img
              src="/icon-192.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-lg border border-border"
            />
            <div className="min-w-0">
              <DrawerTitle>Install the ADVO app.</DrawerTitle>
              <DrawerDescription className="mt-1">
                It opens from your home screen, without the browser bar.
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        {isIos ? (
          // Safari has no install event, so the only honest thing to show is the
          // two taps the user has to make themselves.
          <div
            className="mx-4 flex flex-col gap-2 rounded-md border border-border bg-secondary/50 p-3 text-sm"
            data-testid="install-ios-steps"
          >
            <span className="flex items-center gap-2">
              <Share className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              Tap Share in the Safari toolbar.
            </span>
            <span className="flex items-center gap-2">
              <SquarePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              Then tap Add to Home Screen.
            </span>
          </div>
        ) : null}

        {/* The sheet is portalled outside #root, so it does not inherit the
            standalone safe-area padding and has to clear the home indicator itself. */}
        <DrawerFooter className="flex-row gap-2 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          {isIos ? (
            <Button variant="secondary" className="flex-1" onClick={dismiss}>
              Got it
            </Button>
          ) : (
            <>
              <Button variant="ghost" className="flex-1" onClick={dismiss}>
                Not now
              </Button>
              <Button className="flex-1" onClick={() => void install()} data-testid="install-accept">
                Install
              </Button>
            </>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default InstallPrompt;
