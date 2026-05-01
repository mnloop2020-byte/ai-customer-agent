"use client";

import { CompanyProfile, companyProfileSchema, defaultCompanyProfile } from "@/domain/company";

const storageKey = "ai-customer-agent.company-profile";

export function loadCompanyProfile(): CompanyProfile {
  if (typeof window === "undefined") return defaultCompanyProfile;

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return defaultCompanyProfile;

  try {
    return companyProfileSchema.parse(JSON.parse(raw));
  } catch {
    return defaultCompanyProfile;
  }
}

export function saveCompanyProfile(profile: CompanyProfile) {
  const parsed = companyProfileSchema.parse(profile);
  window.localStorage.setItem(storageKey, JSON.stringify(parsed));
  window.dispatchEvent(new Event("company-profile-updated"));
}

export function resetCompanyProfile() {
  window.localStorage.removeItem(storageKey);
  window.dispatchEvent(new Event("company-profile-updated"));
}

