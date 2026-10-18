# Gera automacao/MeuBolso.macro (formato de exportação do MacroDroid) com os apps de NotificationReaderService.
# Uso: python3 scripts/make-macro.py
import json, random, re, time, sys
src = open('android/app/src/main/java/br/com/meubolso/app/NotificationReaderService.java').read()
apps = re.findall(r'APPS\.put\("([^"]+)", "([^"]+)"\)', src)
rnd = random.Random(20261018)
gid = lambda: -rnd.randrange(1, 2**63)
magic = '{not_app_name} {not_title} {notification}'
trigger = {
    'enableRegex': False, 'ignoreCase': True,
    'm_applicationNameList': [n for _, n in apps], 'm_packageNameList': [p for p, _ in apps],
    'm_exactMatch': False, 'm_excludeApps': False, 'm_excludes': False, 'm_ignoreOngoing': True,
    'm_option': 0, 'm_soundOption': 0, 'm_supressMultiples': True, 'm_textContent': '',
    'matchOptionMessage': 0, 'matchOptionTitle': 0, 'separateTitleAndMessage': False,
    'disableLogging': False, 'm_SIGUID': gid(), 'm_classType': 'NotificationTrigger',
    'm_comment': 'Notificações dos apps de banco e carteira', 'm_constraintList': [], 'm_isDisabled': False, 'm_isOrCondition': False,
}
intent = {
    'EXTRA_TYPE_AUTO': 0, 'EXTRA_TYPE_BOOLEAN': 2, 'EXTRA_TYPE_DOUBLE': 6, 'EXTRA_TYPE_FLOAT': 5, 'EXTRA_TYPE_INT': 3,
    'EXTRA_TYPE_LONG': 4, 'EXTRA_TYPE_STRING': 1, 'EXTRA_TYPE_STRING_ARRAY': 7,
    'm_action': 'br.com.meubolso.app.REGISTRAR', 'm_className': '', 'm_data': '',
    'm_extra1Name': 'texto', 'm_extra1Type': 1, 'm_extra1Value': magic,
    **{f'm_extra{i}{k}': ('' if k != 'Type' else 0) for i in range(2, 7) for k in ('Name', 'Type', 'Value')},
    'm_flags': 0, 'm_mimeType': '', 'm_packageName': 'br.com.meubolso.app', 'm_target': 'Broadcast', 'useCustomCategory': False,
    'disableLogging': False, 'm_SIGUID': gid(), 'm_classType': 'SendIntentAction',
    'm_comment': 'Envia o texto da notificação para o Meu Bolso', 'm_constraintList': [], 'm_isDisabled': False, 'm_isOrCondition': False,
}
link = {
    'allowAnyCertificate': False, 'blockNextAction': False, 'm_disableUrlEncode': False, 'm_httpGet': False,
    'm_urlToOpen': 'meubolso://registrar?texto=' + magic,
    'disableLogging': False, 'm_SIGUID': gid(), 'm_classType': 'OpenWebPageAction',
    'm_comment': 'Opção 2: ative esta e desative a de cima se o diagnóstico do Meu Bolso não mostrar nada', 'm_constraintList': [], 'm_isDisabled': True, 'm_isOrCondition': False,
}
now = int(time.time() * 1000)
macro = {
    'globalVariables': [],
    'macro': {
        'aiGenerated': 0, 'breakpoints': [], 'disabledTimestamp': 0, 'exportedActionBlocks': [], 'forceEvenIfNotEnabledTimestamp': 0,
        'isActionBlock': False, 'isExtra': False, 'isFavourite': False, 'lastEditedTimestamp': now, 'localVariables': [],
        'localVarsAlphabetical': False, 'loggingLevel': 0, 'm_GUID': gid(), 'm_actionList': [intent, link], 'm_category': 'Meu Bolso',
        'm_completed': True, 'm_constraintList': [],
        'm_description': 'Repassa as notificações de Pix, compras e transferências do Mercado Pago, 99 e bancos para o app Meu Bolso, que registra sozinho. O que não tem valor é ignorado. Confira o que chegou em Meu Bolso → Ajustes → Diagnóstico.',
        'm_descriptionOpen': False, 'm_enabled': True, 'm_excludeLog': False, 'm_headingColor': -11382190, 'm_isOrCondition': False,
        'm_name': 'Meu Bolso - registrar notificações', 'm_triggerList': [trigger],
    },
    'macroExportVersion': 1,
}
json.dump(macro, open('automacao/MeuBolso.macro', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(apps), 'apps')
