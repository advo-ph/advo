import { useEffect, useSyncExternalStore } from "react";
import { get, patch } from "@/lib/api";
import type { AdminSection } from "@/components/admin/AdminSidebar";

/**
 * Sidebar items hidden for every console user. Stored in site_config under
 * `nav_hidden`; only the owner may change it (the API enforces that).
 * Until the owner saves a list, this default applies.
 */
const SETTING_KEY = "nav_hidden";
export const DEFAULT_NAV_HIDDEN: AdminSection[] = [
  "time",
  "corpus",
  "messages",
  "accountability",
  "finance",
  "engagement",
];

const EVENT = "advo:nav-hidden";
let current: AdminSection[] = DEFAULT_NAV_HIDDEN;
let loaded = false;

const setCurrent = (next: AdminSection[]) => {
  current = next;
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

export const useNavHidden = () => {
  const hidden = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    if (loaded) return;
    loaded = true;
    get<{ value: unknown }>(`/api/settings/${SETTING_KEY}`).then((res) => {
      if (Array.isArray(res.data?.value)) setCurrent(res.data.value as AdminSection[]);
    });
  }, []);

  const save = async (next: AdminSection[]) => {
    const prev = current;
    setCurrent(next);
    const res = await patch(`/api/settings/${SETTING_KEY}`, { value: next });
    if (res.error) setCurrent(prev);
    return res;
  };

  return { hidden, save };
};
