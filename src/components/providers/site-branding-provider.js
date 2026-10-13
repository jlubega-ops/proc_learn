"use client";

import { createContext, useContext } from "react";
import Image from "next/image";
import { DEFAULT_SITE_BRANDING } from "@/lib/site-branding-defaults";

const SiteBrandingContext = createContext(DEFAULT_SITE_BRANDING);

/**
 * @param {{ branding?: typeof DEFAULT_SITE_BRANDING | null; children: import("react").ReactNode }} props
 */
export function SiteBrandingProvider({ branding, children }) {
  return (
    <SiteBrandingContext.Provider value={branding || DEFAULT_SITE_BRANDING}>{children}</SiteBrandingContext.Provider>
  );
}

export function useSiteBranding() {
  return useContext(SiteBrandingContext);
}

/**
 * Site logo (system admin can replace it under Site settings).
 * @param {Omit<import("next/image").ImageProps, "src">} props
 */
export function BrandLogoImage(props) {
  const { logoUrl } = useSiteBranding();
  return <Image src={logoUrl} {...props} alt={props.alt} />;
}

/**
 * Sign-in / public page background (system admin can replace it under Site settings).
 * @param {Omit<import("next/image").ImageProps, "src">} props
 */
export function BrandBackgroundImage(props) {
  const { backgroundUrl } = useSiteBranding();
  return <Image src={backgroundUrl} {...props} alt={props.alt} />;
}
