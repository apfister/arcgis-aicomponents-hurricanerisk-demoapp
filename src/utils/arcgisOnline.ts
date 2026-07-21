import OAuthInfo from "@arcgis/core/identity/OAuthInfo";
import esriId from "@arcgis/core/identity/IdentityManager";
import Portal from "@arcgis/core/portal/Portal";
import { config } from "../config";

let oauthInfo: OAuthInfo | null = null;

/** Registers OAuth info with the IdentityManager. Safe to call multiple times. */
export function initializeOAuth(): OAuthInfo {
  if (oauthInfo) {
    return oauthInfo;
  }
  oauthInfo = new OAuthInfo({
    appId: config.oauthAppId,
    portalUrl: config.portalUrl,
    popup: false,
  });
  esriId.registerOAuthInfos([oauthInfo]);
  return oauthInfo;
}

/** The signed-in portal user, or null if not signed in. */
export interface SignedInUser {
  username: string;
  fullName: string;
}

/** Checks for an existing credential without prompting for sign-in. */
export async function checkSignInStatus(): Promise<SignedInUser | null> {
  initializeOAuth();
  try {
    await esriId.checkSignInStatus(`${config.portalUrl}/sharing`);
    return await loadUser();
  } catch {
    return null;
  }
}

/** Prompts the user to sign in (redirect flow) and resolves with the user. */
export async function signIn(): Promise<SignedInUser> {
  initializeOAuth();
  await esriId.getCredential(`${config.portalUrl}/sharing`);
  return loadUser();
}

/** Signs the current user out. */
export function signOut(): void {
  esriId.destroyCredentials();
}

async function loadUser(): Promise<SignedInUser> {
  const portal = new Portal({ url: config.portalUrl });
  await portal.load();
  return {
    username: portal.user?.username ?? "",
    fullName: portal.user?.fullName ?? portal.user?.username ?? "",
  };
}
