const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;

export async function getOrCreateKeyPair(uid: string): Promise<{ privateKey: CryptoKey; publicKeyB64: string }> {
  const storageKey = `velvit_e2e_${uid}`;
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    try {
      const { privateJwk, publicKeyB64 } = JSON.parse(stored);
      const privateKey = await crypto.subtle.importKey('jwk', privateJwk, ECDH_PARAMS, false, ['deriveKey']);
      return { privateKey, publicKeyB64 };
    } catch {}
  }
  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveKey']);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(publicRaw)));
  localStorage.setItem(storageKey, JSON.stringify({ privateJwk, publicKeyB64 }));
  return { privateKey: keyPair.privateKey, publicKeyB64 };
}

export async function deriveSharedKey(myPrivateKey: CryptoKey, theirPublicKeyB64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(theirPublicKeyB64), c => c.charCodeAt(0));
  const theirPublicKey = await crypto.subtle.importKey('raw', raw, ECDH_PARAMS, false, []);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(key: CryptoKey, plaintext: string): Promise<{ ct: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return {
    ct: btoa(String.fromCharCode(...new Uint8Array(enc))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptText(key: CryptoKey, ct: string, ivB64: string): Promise<string> {
  try {
    const enc = Uint8Array.from(atob(ct), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc);
    return new TextDecoder().decode(dec);
  } catch {
    return '🔒 [mensagem criptografada]';
  }
}
