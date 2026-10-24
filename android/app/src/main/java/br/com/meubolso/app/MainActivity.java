package br.com.meubolso.app;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
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
        // Voltar do Android: quem decide é o app (fecha a folha aberta, volta de tela, fica no Início).
        // O app só sai pelo botão de início ou pelo de apps recentes.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("window.meuBolsoVoltar && window.meuBolsoVoltar()", null);
                }
            }
        });
    }
}
