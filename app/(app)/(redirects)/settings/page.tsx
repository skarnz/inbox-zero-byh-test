import { redirectToEmailAccountPath } from "@/utils/account";

export default async function SettingsPage() {
  await redirectToEmailAccountPath("/settings");
}
