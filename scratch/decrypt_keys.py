import base64

def decrypt_api_key(encrypted_str):
    try:
        encrypted_bytes = base64.b64decode(encrypted_str).decode('latin1')
        xor_key = "antigravity"
        decrypted_chars = []
        for i, char in enumerate(encrypted_bytes):
            byte_val = ord(char)
            key_char_val = ord(xor_key[i % len(xor_key)])
            decrypted_chars.append(chr(byte_val ^ key_char_val))
        
        decrypted = "".join(decrypted_chars)
        # reverse the string
        return decrypted[::-1]
    except Exception as e:
        print("Error decrypting API Key", e)
        return ""

obfuscated_keys = [
    "Bj0tWj5ALh0OPyEWWy09BDYVAQw+I1UMHDoEPSBBPkQJCwoAXC1HCxgGBTJXICZRBTNPJyg=", # Clave Principal (Ofuscada)
    "MCYrCwEAKw4fMjAiBAAbOBgiDzY2NREDBwIqOgcEMAQ/JzlEAD0VA0IoMTVXICZRBTNPJyg=", # Clave de Respaldo 1 (Ofuscada)
    "IDorCwgQOSAwJiArMUMTVQpMHRwONBMBLF1TIhsXUR5BBy1MOg0mFgMGODNXICZRBTNPJyg=", # Clave de Respaldo 2 (Ofuscada)
    "MAkHAxM2KkUuPigHKAM9MRw7QwI4CFAAWR8QLQMPRAcsGDYHEw8IAzMwPzJXICZRBTNPJyg="  # Clave de Respaldo 3 (Ofuscada)
]

print("Decrypted Keys:")
for idx, key in enumerate(obfuscated_keys):
    print(f"Key {idx + 1}: {decrypt_api_key(key)}")
