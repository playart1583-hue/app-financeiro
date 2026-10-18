package br.com.meubolso.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
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
        if (text == null || text.trim().isEmpty() || !text.contains("R$")) return;
        try {
            JSONObject item = new JSONObject();
            long now = System.currentTimeMillis();
            // a mesma notificação repetida no mesmo minuto conta uma vez só
            item.put("key", "automacao|" + (now / 60000) + "|" + text.hashCode());
            item.put("package", "automacao");
            item.put("app", "");
            item.put("title", "");
            item.put("text", text.trim());
            item.put("time", now);
            NotificationStore.add(context, item);
        } catch (JSONException ignored) {
            // texto inválido: ignora
        }
    }
}
