# 2. Pubblica su un hosting condiviso

Questa è la strada per un tipico account cPanel / Plesk con FTP o un file manager e senza SSH.

## Prima di caricare

1. **Dominio e HTTPS.** Collega il tuo dominio (o un sottodominio come `www`, `demo`) a una cartella e attiva il certificato gratuito (Let's Encrypt / AutoSSL). CanvasCore ti avvisa nella pagina di installazione se non sei in HTTPS.
2. **Versione di PHP.** Nel pannello (*MultiPHP Manager*, *Select PHP version*) scegli **8.2 o 8.3** per quel dominio e spunta le estensioni `pdo_sqlite`, `dom`, `zip`, `sodium`, `gd`, `curl`, `mbstring` se il pannello le elenca.
3. **Una cartella per sito.** Usa una cartella per ogni sito CanvasCore. Funziona anche un sito in una sottocartella (`example.com/site/`).

## Carica e installa

Carica lo ZIP della release, estrailo nella cartella del sito e avvia la procedura guidata ([tutorial 1](01-install.md)). Tutto quello che CanvasCore pubblica (le tue pagine) va accanto a `canvascore-admin/`, nella stessa cartella.

## Dove stanno i dati

Il database e le impostazioni si trovano in una **cartella dei dati**. CanvasCore la mette **fuori dalla radice web** quando può (una cartella chiamata `canvascore-data` accanto alla radice web), che è il posto più sicuro. Se l'hosting non lo permette, ripiega su `canvascore-admin/data/`, protetta da regole in un file `.htaccess`. La pagina di installazione ti dice quale usa e verifica perfino che la cartella non si possa scaricare.

> Fai il backup della cartella dei dati e di `uploads/` anche con il backup del tuo hosting (la pagina Backup crea uno ZIP completo, sezione 4 del [tutorial 4](04-manage.md)).

## Email dai moduli

I moduli di contatto usano la funzione PHP `mail()`. Se il tuo hosting la disattiva, i messaggi vengono comunque salvati in **Amministrazione › Invii**; chiedi al tuo hosting di abilitare `mail()` senza SMTP oppure usa un servizio per moduli tramite **Integrazioni** (webhook).

## Pubblicazione programmata senza cron

Una pagina o un articolo del blog può andare online a un'ora stabilita. CanvasCore fa il cambio alla prima richiesta dopo quell'ora, quindi a un sito con visitatori non serve nulla. Se vuoi che sia puntuale anche su un sito poco visitato, aggiungi un cron job (*Cron Jobs* di cPanel) che esegua `php /path/to/canvascore-admin/cron.php` ogni pochi minuti.

## Aggiornare

**Amministrazione › Aggiornamenti › Cerca aggiornamenti**, poi **Aggiorna a X**. Il pacchetto è firmato e verificato, prima viene fatto un backup, e l'aggiornamento torna indietro da solo se la nuova versione non supera il controllo di funzionamento. Niente da caricare.

## Se qualcosa non funziona

- *La pagina di installazione dice che una cartella non è scrivibile*: imposta i permessi della cartella del sito e di `uploads/` in modo che PHP possa scriverci (755 o 775 a seconda dell'hosting).
- *Una pagina bianca o un errore 500*: il log degli errori di PHP (la pagina *Errors* del pannello) ti dice perché. La causa più comune è una versione di PHP inferiore alla 8.0.
- *Le pagine sono pubblicate ma l'indirizzo dice "non trovato"*: l'indirizzo del sito in **Opzioni globali** è vuoto o sbagliato, oppure il server web non serve le cartelle con `index.html` (raro).
- *Nginx*: aggiungi le regole dell'[Administrator Guide](../../manuals/ADMIN-GUIDE.md#42-nginx) (in inglese), sezione 4.2.

**Prossimo passo:** [crea il tuo primo sito](03-first-site.md).
