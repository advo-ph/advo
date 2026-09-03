import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";

/**
 * `refetchOnWindowFocus` is ON deliberately.
 *
 * It was off, and being off is what turned every missing cache invalidation into
 * a user-visible bug instead of a two-second flicker. The reported symptom was
 * "sometimes it doesn't update stuff": an admin marks an invoice paid in one
 * tab, switches to another screen, comes back, and is still looking at the value
 * the browser guessed rather than the one the database holds. With focus
 * refetching off there was nothing left to correct it short of a hard reload.
 *
 * The cost is bounded by `staleTime`. A query touched inside the last two
 * minutes is not refetched on focus at all, so tabbing back and forth costs
 * nothing. Only genuinely stale data is re-read.
 *
 * Every optimistic mutation now reconciles through its own `onSettled`, so this
 * is a safety net rather than the mechanism. Both are wanted: the explicit
 * invalidation makes the common path correct, and this catches whatever the
 * next hook forgets.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 min
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);
