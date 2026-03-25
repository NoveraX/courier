import { toast } from "sonner";

/** Copy text to clipboard and show a success toast */
export async function copyToClipboard(text: string, label: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  toast.success(`Copied ${label}`);
}
