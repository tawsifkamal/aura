import nacl from "tweetnacl";
import { blake2b } from "blakejs";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Implements libsodium's crypto_box_seal using tweetnacl + blakejs.
 *
 * Sealed box = ephemeral_pk || crypto_box(message, nonce, recipient_pk, ephemeral_sk)
 * where nonce = BLAKE2b(ephemeral_pk || recipient_pk, 24 bytes)
 */
export function encryptSecret(
  publicKeyBase64: string,
  secretValue: string,
): string {
  const recipientPk = base64ToUint8Array(publicKeyBase64);

  // Generate ephemeral X25519 keypair
  const ephemeral = nacl.box.keyPair();

  // Derive nonce: BLAKE2b(ephemeral_pk || recipient_pk) truncated to 24 bytes
  const nonceInput = new Uint8Array(
    ephemeral.publicKey.length + recipientPk.length,
  );
  nonceInput.set(ephemeral.publicKey);
  nonceInput.set(recipientPk, ephemeral.publicKey.length);
  const nonce = blake2b(nonceInput, undefined, 24);

  // Encrypt
  const messageBytes = new TextEncoder().encode(secretValue);
  const encrypted = nacl.box(
    messageBytes,
    nonce,
    recipientPk,
    ephemeral.secretKey,
  );

  // Sealed box = ephemeral_pk || ciphertext
  const sealed = new Uint8Array(ephemeral.publicKey.length + encrypted.length);
  sealed.set(ephemeral.publicKey);
  sealed.set(encrypted, ephemeral.publicKey.length);

  return uint8ArrayToBase64(sealed);
}
