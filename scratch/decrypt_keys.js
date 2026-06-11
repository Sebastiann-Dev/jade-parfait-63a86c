// Script to decrypt the obfuscated keys to inspect them
function decryptApiKey(encryptedStr) {
  try {
    const encryptedBytes = atob(encryptedStr);
    const xorKey = "antigravity";
    const decryptedChars = [];
    for (let i = 0; i < encryptedBytes.length; i++) {
      const byte = encryptedBytes.charCodeAt(i);
      const keyChar = xorKey.charCodeAt(i % xorKey.length);
      decryptedChars.push(String.fromCharCode(byte ^ keyChar));
    }
    return decryptedChars.join("").split("").reverse().join("");
  } catch (e) {
    console.error("Error decrypting API Key", e);
    return "";
  }
}

const OBFUSCATED_KEYS = [
  "Bj0tWj5ALh0OPyEWWy09BDYVAQw+I1UMHDoEPSBBPkQJCwoAXC1HCxgGBTJXICZRBTNPJyg=", // Clave Principal (Ofuscada)
  "MCYrCwEAKw4fMjAiBAAbOBgiDzY2NREDBwIqOgcEMAQ/JzlEAD0VA0IoMTVXICZRBTNPJyg=", // Clave de Respaldo 1 (Ofuscada)
  "IDorCwgQOSAwJiArMUMTVQpMHRwONBMBLF1TIhsXUR5BBy1MOg0mFgMGODNXICZRBTNPJyg=", // Clave de Respaldo 2 (Ofuscada)
  "MAkHAxM2KkUuPigHKAM9MRw7QwI4CFAAWR8QLQMPRAcsGDYHEw8IAzMwPzJXICZRBTNPJyg="  // Clave de Respaldo 3 (Ofuscada)
];

console.log("Decrypted Keys:");
OBFUSCATED_KEYS.forEach((key, index) => {
  console.log(`Key ${index + 1}: ${decryptApiKey(key)}`);
});
