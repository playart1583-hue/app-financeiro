package br.com.meubolso.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Recebe o texto de notificações enviado por apps de automação (MacroDroid, Tasker), que têm o acesso às
 * notificações liberado pela Play Store. O texto entra na mesma fila das notificações e é registrado ao abrir o app.
 */
public class AutomationReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String text = intent.getStringExtra("texto");
        if (text == null) text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null) {
            // nome do extra digitado diferente: usa o primeiro texto que vier
            Bundle extras = intent.getExtras();
            if (extras != null) for (String k : extras.keySet()) {
                Object v = extras.get(k);
                if (v instanceof CharSequence) {
                    text = v.toString();
                    break;
                }
            }
        }
        store(context, text, "intenção");
    }

    /** Guarda o texto na fila e registra a entrega no diagnóstico. */
    static void store(Context context, String text, String via) {
        long now = System.currentTimeMillis();
        String clean = text == null ? "" : text.trim();
        boolean hasNumber = clean.matches("(?s).*\\d.*");
        try {
            JSONObject log = new JSONObject();
            log.put("time", now);
            log.put("via", via);
            log.put("text", clean.length() > 160 ? clean.substring(0, 160) + "…" : clean);
            log.put("queued", hasNumber);
            NotificationStore.log(context, log);
            if (!hasNumber) return;
            JSONObject item = new JSONObject();
            // a mesma notificação repetida no mesmo minuto conta uma vez só
            item.put("key", "automacao|" + (now / 60000) + "|" + clean.hashCode());
            item.put("package", "automacao");
            item.put("app", "");
            item.put("title", "");
            item.put("text", clean);
            item.put("time", now);
            NotificationStore.add(context, item);
        } catch (JSONException ignored) {
            // texto inválido: ignora
        }
    }
}
