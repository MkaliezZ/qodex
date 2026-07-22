import type { OpenedProjectDirectory } from "./types";

export interface OpenProjectBindingIdentity {
  bindingId: string;
  displayName: string;
  privateRootPath: string;
  projectFingerprint: string;
}

export async function projectBindingIdentity(opened: OpenedProjectDirectory): Promise<OpenProjectBindingIdentity> {
  const material = `${opened.source}\0${opened.privateRootPath}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  const fingerprint = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    bindingId: `project-${fingerprint.slice(0, 24)}`,
    displayName: opened.name,
    privateRootPath: opened.privateRootPath,
    projectFingerprint: `sha256:${fingerprint}`,
  };
}
