package com.ciphergap.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** One authenticated, private store. No keys in page localStorage or Android backups. */
final class SecureStore {
    private final android.content.SharedPreferences prefs;
    private final SecretKey key;
    SecureStore(Context context) throws Exception {
        prefs = context.getSharedPreferences("ciphergap_secure", Context.MODE_PRIVATE);
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias("ciphergap_store_v1")) {
            KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder("ciphergap_store_v1", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            gen.generateKey();
        }
        key = (SecretKey) ks.getKey("ciphergap_store_v1", null);
    }
    synchronized JSONObject read() throws Exception {
        String encoded = prefs.getString("data", null);
        if (encoded == null) return new JSONObject();
        byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
        if (bytes.length < 28) throw new IllegalStateException("Stored settings are damaged.");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, Arrays.copyOf(bytes, 12)));
        return new JSONObject(new String(c.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8));
    }
    synchronized void write(JSONObject data) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key);
        byte[] encrypted = c.doFinal(data.toString().getBytes(StandardCharsets.UTF_8));
        byte[] bytes = new byte[12 + encrypted.length];
        System.arraycopy(c.getIV(), 0, bytes, 0, 12); System.arraycopy(encrypted, 0, bytes, 12, encrypted.length);
        if (!prefs.edit().putString("data", Base64.encodeToString(bytes, Base64.NO_WRAP)).commit())
            throw new IllegalStateException("Could not save settings.");
    }
}
