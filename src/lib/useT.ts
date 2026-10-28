import { useAppStore } from "../store";
import { t } from "./i18n";

/** Returns the translator and subscribes the component to language changes. */
export const useT = () => {
  useAppStore((s) => s.settings.language);
  return t;
};
