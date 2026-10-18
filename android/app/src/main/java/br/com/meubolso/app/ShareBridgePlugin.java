package br.com.meubolso.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.core.content.FileProvider;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.util.ArrayList;

/** Ponte entre o Android e o app web: conteúdo recebido pelo menu Compartilhar e salvar o backup. */
@CapacitorPlugin(name = "ShareBridge")
public class ShareBridgePlugin extends Plugin {

    private static final int MAX_FILE_BYTES = 15 * 1024 * 1024;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (isShare(intent)) {
            MainActivity.pendingShare = intent;
            notifyListeners("shared", new JSObject(), true);
        }
    }

    static boolean isShare(Intent intent) {
        return intent != null && (Intent.ACTION_SEND.equals(intent.getAction()) || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction()));
    }

    /** Salva um arquivo (backup) abrindo o menu Compartilhar: Drive, Arquivos, WhatsApp, e-mail... */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "meu-bolso.json");
        String text = call.getString("text", "");
        try {
            File dir = new File(getContext().getCacheDir(), "exportar");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("sem pasta");
            File file = new File(dir, name.replaceAll("[^\\w.\\-]", "_"));
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(call.getString("mimeType", "application/json"));
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Salvar backup do Meu Bolso");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não consegui preparar o arquivo: " + e.getMessage());
        }
    }

    /** Texto e arquivos recebidos pelo menu Compartilhar (uma vez; depois é limpo). */
    @PluginMethod
    public void getShared(PluginCall call) {
        Intent intent = MainActivity.pendingShare;
        MainActivity.pendingShare = null;
        JSObject ret = new JSObject();
        if (intent == null) {
            call.resolve(ret);
            return;
        }
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String joined = ((subject == null ? "" : subject + "\n") + (text == null ? "" : text)).trim();
        if (!joined.isEmpty()) ret.put("text", joined);
        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        }
        JSArray files = new JSArray();
        for (Uri uri : uris) {
            JSObject f = readUri(uri);
            if (f != null) files.put(f);
        }
        ret.put("files", files);
        call.resolve(ret);
    }

    private JSObject readUri(Uri uri) {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                if (out.size() > MAX_FILE_BYTES) return null;
            }
            JSObject f = new JSObject();
            f.put("name", displayName(uri));
            f.put("mimeType", getContext().getContentResolver().getType(uri));
            f.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            return f;
        } catch (Exception e) {
            return null;
        }
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // sem nome: usa o fim da URI
        }
        String last = uri.getLastPathSegment();
        return last == null ? "arquivo" : last;
    }
}
