import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";
import { AppRoleGate } from "@/components/AppRoleGate";
import {
  getPlatformSettings,
  resolvePlatformMarkForPlacement,
} from "@/lib/platform-settings";

export default async function HomePage() {
  const settings = await getPlatformSettings();
  const homeMark = resolvePlatformMarkForPlacement(settings, "home");

  return (
    <SiteBrandingProvider>
      <AppRoleGate
        siteName={settings.siteName}
        markSrc={homeMark.src}
        markKind={homeMark.kind}
      />
    </SiteBrandingProvider>
  );
}
