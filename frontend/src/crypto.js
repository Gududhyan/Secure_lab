const encoder = new TextEncoder()
const decoder = new TextDecoder()
const PBKDF2_ITERATIONS = 310000

function bytesToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function pemToBytes(pem) {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s/g, '')
  return base64ToBytes(body)
}

function bytesToPem(bytes, label) {
  const encoded = bytesToBase64(new Uint8Array(bytes))
  const lines = encoded.match(/.{1,64}/g).join('\n')
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`
}

async function deriveKey(passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function createPatientKeyPair(passphrase) {
  if (!window.crypto?.subtle) throw new Error('Web Crypto is unavailable. Open the app on localhost or HTTPS.')
  if (passphrase.length < 12) throw new Error('Use a key-file passphrase of at least 12 characters.')

  const pair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  )
  const publicDer = await crypto.subtle.exportKey('spki', pair.publicKey)
  const privateDer = await crypto.subtle.exportKey('pkcs8', pair.privateKey)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const wrappingKey = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  const encryptedPrivateKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, privateDer)

  const keyFile = {
    format: 'SecureLab encrypted patient key',
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    encrypted_private_key: bytesToBase64(new Uint8Array(encryptedPrivateKey)),
  }

  return {
    publicKeyPem: bytesToPem(publicDer, 'PUBLIC KEY'),
    keyFile,
  }
}

export async function unlockPatientKeyFile(file, passphrase) {
  const keyFile = JSON.parse(await file.text())
  if (keyFile.format !== 'SecureLab encrypted patient key' || keyFile.version !== 1 || keyFile.kdf !== 'PBKDF2-SHA256' || keyFile.iterations !== PBKDF2_ITERATIONS) {
    throw new Error('This is not a supported SecureLab key file.')
  }
  const salt = base64ToBytes(keyFile.salt)
  const iv = base64ToBytes(keyFile.iv)
  const encrypted = base64ToBytes(keyFile.encrypted_private_key)
  const wrappingKey = await deriveKey(passphrase, salt, keyFile.iterations)
  let privateDer
  try {
    privateDer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, encrypted)
  } catch {
    throw new Error('Unable to unlock key file. Check the passphrase or file integrity.')
  }
  return crypto.subtle.importKey(
    'pkcs8',
    privateDer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  )
}

export async function decryptAndVerifyReport(payload, patientPrivateKey) {
  const wrappedKey = base64ToBytes(payload.wrapped_aes_key)
  const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, patientPrivateKey, wrappedKey)
  const aesKey = await crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.nonce), tagLength: 128 },
    aesKey,
    base64ToBytes(payload.ciphertext),
  )

  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', plaintext))
  const digestHex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
  if (digestHex !== payload.sha256_hex) throw new Error('Report hash mismatch. The document may have been modified.')

  const hospitalPublicKey = await crypto.subtle.importKey(
    'spki',
    pemToBytes(payload.hospital_public_key_pem),
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signatureValid = await crypto.subtle.verify(
    { name: 'RSA-PSS', saltLength: 32 },
    hospitalPublicKey,
    base64ToBytes(payload.signature),
    plaintext,
  )
  if (!signatureValid) throw new Error('Digital signature is invalid. Do not trust this report.')
  return new Blob([plaintext], { type: 'application/pdf' })
}

export function downloadKeyFile(keyFile, fileName = 'securelab-patient-key.securelabkey') {
  const blob = new Blob([JSON.stringify(keyFile, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
