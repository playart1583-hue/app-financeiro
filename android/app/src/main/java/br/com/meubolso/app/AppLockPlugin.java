package br.com.meubolso.app;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Bloqueio do app com a digital, o rosto ou a senha de tela do celular. */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    // BIOMETRIC_WEAK + senha do celular é a combinação aceita do Android 7 ao 16
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void status(PluginCall call) {
        BiometricManager bm = BiometricManager.from(getContext());
        JSObject ret = new JSObject();
        ret.put("available", bm.canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS);
        ret.put("biometric", bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    JSObject ret = new JSObject();
                    ret.put("ok", true);
                    call.resolve(ret);
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    call.reject(errString.toString(), String.valueOf(errorCode));
                }
                // onAuthenticationFailed (dedo não reconhecido): a própria janela pede de novo
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(call.getString("title", "Desbloquear Meu Bolso"))
                .setSubtitle(call.getString("subtitle", "Use a digital ou a senha do celular"))
                .setAllowedAuthenticators(AUTH)
                .build();
            prompt.authenticate(info);
        });
    }
}
