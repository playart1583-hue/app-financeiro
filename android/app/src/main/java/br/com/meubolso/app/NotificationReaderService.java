package br.com.meubolso.app;

import android.app.Notification;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Lê as notificações de bancos e carteiras (Mercado Pago, 99, Nubank...) que tenham valor em reais.
 * Só funciona depois que a pessoa libera "Acesso a notificações" para o Meu Bolso nas configurações do Android.
 */
public class NotificationReaderService extends NotificationListenerService {

    static final Map<String, String> APPS = new HashMap<>();

    static {
        APPS.put("com.mercadopago.wallet", "Mercado Pago");
        APPS.put("com.taxis99", "99");
        APPS.put("com.app99.driver", "99 Motorista");
        APPS.put("com.nu.production", "Nubank");
        APPS.put("br.com.intermedium", "Inter");
        APPS.put("com.itau", "Itaú");
        APPS.put("com.itau.pf", "Itaú Personnalité");
        APPS.put("com.bradesco", "Bradesco");
        APPS.put("com.santander.app", "Santander");
        APPS.put("br.com.gabba.Caixa", "Caixa");
        APPS.put("br.gov.caixa.tem", "Caixa Tem");
        APPS.put("br.com.bb.android", "Banco do Brasil");
        APPS.put("com.picpay", "PicPay");
        APPS.put("com.c6bank.app", "C6 Bank");
        APPS.put("br.com.uol.ps.myaccount", "PagBank");
        APPS.put("br.com.neon", "Neon");
        APPS.put("com.btg.pactual.banking", "BTG");
        APPS.put("com.google.android.apps.walletnfcrel", "Google Wallet");
        APPS.put("com.samsung.android.spay", "Samsung Wallet");
    }

    private static final Pattern MONEY = Pattern.compile("R\\$\\s?-?\\d");
    private static final Pattern FINANCE = Pattern.compile("(?i)(pix|compra|pagamento|pago|transfer|recebeu|enviou|d[eé]bito|cr[eé]dito|fatura|saque|dep[oó]sito|corrida)");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String pkg = sbn.getPackageName();
        if (pkg.equals(getPackageName())) return;
        Notification n = sbn.getNotification();
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        Bundle extras = n.extras;
        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence text = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        if (text == null) text = extras.getCharSequence(Notification.EXTRA_TEXT);
        String all = (title == null ? "" : title) + " " + (text == null ? "" : text);
        if (!MONEY.matcher(all).find()) return;
        // apps conhecidos sempre; os demais só se parecer movimentação financeira
        if (!APPS.containsKey(pkg) && !FINANCE.matcher(all).find()) return;
        try {
            JSONObject item = new JSONObject();
            item.put("key", sbn.getKey());
            item.put("package", pkg);
            item.put("app", appName(pkg));
            item.put("title", title == null ? "" : title.toString());
            item.put("text", text == null ? "" : text.toString());
            item.put("time", sbn.getPostTime());
            NotificationStore.add(this, item);
        } catch (JSONException ignored) {
            // notificação malformada: ignora
        }
    }

    private String appName(String pkg) {
        String known = APPS.get(pkg);
        if (known != null) return known;
        try {
            PackageManager pm = getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }
}
