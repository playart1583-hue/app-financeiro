package br.com.meubolso.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Recebe meubolso://registrar?texto=... (ação "Abrir site" do MacroDroid), guarda o texto e fecha na hora,
 * sem mostrar o app. Lê tudo depois de "texto=" para não cortar textos com & ou #.
 */
public class RegistrarActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri uri = getIntent() == null ? null : getIntent().getData();
        String text = null;
        if (uri != null) {
            String raw = uri.getEncodedSchemeSpecificPart();
            if (uri.getEncodedFragment() != null) raw += "%23" + uri.getEncodedFragment();
            int i = raw == null ? -1 : raw.indexOf("texto=");
            if (i >= 0) text = Uri.decode(raw.substring(i + 6).replace('+', ' '));
        }
        AutomationReceiver.store(this, text, "link");
        Toast.makeText(this, text != null && text.matches("(?s).*\\d.*") ? "Meu Bolso: recebido" : "Meu Bolso: chegou sem texto", Toast.LENGTH_SHORT).show();
        finish();
        overridePendingTransition(0, 0);
    }
}
