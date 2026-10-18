package br.com.meubolso.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Conteúdo recebido pelo menu Compartilhar, até o app web buscar. */
    static volatile Intent pendingShare;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ShareBridgePlugin.class);
        registerPlugin(AppLockPlugin.class);
        if (ShareBridgePlugin.isShare(getIntent())) pendingShare = getIntent();
        super.onCreate(savedInstanceState);
    }
}
