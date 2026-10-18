package br.com.meubolso.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Fila das notificações financeiras capturadas enquanto o app está fechado. */
public final class NotificationStore {

    private static final String PREFS = "meubolso_notificacoes";
    private static final String KEY = "fila";
    private static final int MAX = 300;

    public interface Listener {
        void onNotification(JSONObject item);
    }

    /** Preenchido pelo plugin quando o app está aberto, para registrar na hora. */
    public static volatile Listener listener;

    private NotificationStore() {}

    private static JSONArray read(SharedPreferences prefs) {
        try {
            return new JSONArray(prefs.getString(KEY, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    public static synchronized void add(Context context, JSONObject item) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray list = read(prefs);
        // a mesma notificação costuma ser publicada mais de uma vez (atualizações): guarda só uma
        for (int i = Math.max(0, list.length() - 20); i < list.length(); i++) {
            JSONObject other = list.optJSONObject(i);
            if (other != null && other.optString("key").equals(item.optString("key")) && other.optString("text").equals(item.optString("text"))) return;
        }
        Listener l = listener;
        if (l != null) {
            l.onNotification(item);
            return;
        }
        list.put(item);
        JSONArray trimmed = new JSONArray();
        for (int i = Math.max(0, list.length() - MAX); i < list.length(); i++) trimmed.put(list.opt(i));
        prefs.edit().putString(KEY, trimmed.toString()).apply();
    }

    public static synchronized JSONArray takeAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray list = read(prefs);
        prefs.edit().putString(KEY, "[]").apply();
        return list;
    }
}
